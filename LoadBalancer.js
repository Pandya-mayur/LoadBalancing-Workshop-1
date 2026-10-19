import * as http from "http"
import crypto from "crypto"

import ServerFactory from "./ServerFactory.js"
import Utils from "./Util.js"
// import RoundRobin from "./RoundRobin.js"
// import LeastConnections from "./LeastConnections.js"
// import ConsistentHashing from "./ConsistentHashing.js"

const host = '127.0.0.1'
const port = 8080
const healthCheckInterval = 1000
const healthCheckTimeout = 500
const defenceWindowMs = 1000
const defenceMaxRequests = 10
const defenceMaxUrlLength = 2048

var configuration = undefined
var serverFactory = undefined
var loadBalancingAlgorithm = undefined
const clientRequests = new Map()


export default class LoadBalancer {

    constructor(configuration_) {
        configuration = configuration_

        if (Utils.getAlgorithm(configuration.LoadBalancingAlgorithm) === Utils.Algorithm.RoundRobin) {
            loadBalancingAlgorithm = new RoundRobin(configuration.NoServers)
        }
        else if (Utils.getAlgorithm(configuration.LoadBalancingAlgorithm)  === Utils.Algorithm.LeastConnections) {
            loadBalancingAlgorithm = new LeastConnections()
        }
        else if (Utils.getAlgorithm(configuration.LoadBalancingAlgorithm)  === Utils.Algorithm.ConsistentHashing) {
            loadBalancingAlgorithm = new ConsistentHashing(configuration.NoServers, configuration.Replicas)
        }

        let httpserver = http.createServer(
            async function (req, res) {
                res.setHeader("Content-Type", "application/json");
                if (!serverFactory) {
                    res.writeHead(503)
                    res.end("Load balancer is starting")
                    return
                }
                if (configuration.EnableDefences && !isAllowedRequest(req, res)) {
                    return
                }
                if (req.url.startsWith("/__test/fail/")) {
                    const [serverId, durationText] = req.url.substring("/__test/fail/".length).split("?duration=")
                    const changed = serverFactory.setServerAvailability(serverId, false)
                    if (changed && durationText) {
                        const duration = Number(durationText)
                        if (Number.isFinite(duration) && duration > 0) {
                            setTimeout(() => serverFactory.setServerAvailability(serverId, true), duration)
                        }

                    }
                    res.writeHead(changed ? 200 : 404)
                    res.end(changed ? `${serverId} marked unavailable` : `${serverId} not found`)
                    return
                }
                if (req.url.startsWith("/__test/recover/")) {
                    const serverId = req.url.substring("/__test/recover/".length)
                    const changed = serverFactory.setServerAvailability(serverId, true)
                    res.writeHead(changed ? 200 : 404)
                    res.end(changed ? `${serverId} recovered` : `${serverId} not found`)
                    return
                }
                switch (req.url) {
                    case "/":
                        res.writeHead(200);
                        res.end(`LoadBalancer is running on http://${host}:${port}/\n\nTo make a session request - http://${host}:${port}/[request]`);
                        break
                    case "/health":
                        res.writeHead(200)
                        res.end("load balancer healthy")
                        break
                    default:
                        res.writeHead(200);

                        let serverindex = getNextAvailableServer(req.url)
                        let nextInLineServer = serverFactory.getServerName(serverindex)

                        if (!nextInLineServer) {
                            res.writeHead(503)
                            res.end("Session ACCESS DENIED - no healthy server available")
                            break
                        }

                        //route load to next legitimate server
                        const backendRequest = http.get(`${nextInLineServer}/start`, resp => {
                            let data = ''
                            resp.on('data', chunk => {
                                data += chunk
                            })
                            resp.on('end', () => {
                                res.end(data);
                            })
                        })
                        backendRequest.setTimeout((configuration.MaxProcessingTime ?? 30000) + 1000, () => {
                            backendRequest.destroy()
                            if (!res.writableEnded) {
                                res.writeHead(504)
                                res.end("Session ACCESS DENIED - backend timeout")
                            }
                        })
                        backendRequest.on("error", () => {
                            if (!res.writableEnded) {
                                res.writeHead(503)
                                res.end("Session ACCESS DENIED - backend unavailable")
                            }
                        })
                        break
                }
            }
        );
        httpserver.listen(port, host, () => {
            console.log(`LoadBalancer is running on http://${host}:${port}`)

            serverFactory = new ServerFactory()
            serverFactory.createServers(configuration)
            if (configuration.EnableFaultTolerance) {
                startHealthChecks()
            }

        });

    }
}

function isAllowedRequest(req, res) {
    if (req.url.length > defenceMaxUrlLength ||
        Number(req.headers["content-length"] || 0) > defenceMaxUrlLength) {
        res.writeHead(413)
        res.end("Request rejected: payload is too large")
        return false
    }

    const client = req.socket.remoteAddress ?? "unknown"
    const now = Date.now()
    const previous = clientRequests.get(client) ?? []
    const recent = previous.filter(timestamp => now - timestamp < defenceWindowMs)
    if (recent.length >= defenceMaxRequests) {
        clientRequests.set(client, recent)
        res.writeHead(429)
        res.end("Request rejected: rate limit exceeded")
        return false
    }
    recent.push(now)
    clientRequests.set(client, recent)
    return true
}

function getNextAvailableServer(requestId) {
    const available = configuration.EnableFaultTolerance
        ? new Set(serverFactory.getAvailableServerIds())
        : new Set(serverFactory.getServers().keys())
    if (available.size === 0) {
        return undefined
    }
    for (let attempt = 0; attempt < configuration.NoServers; attempt++) {
        const candidate = loadBalancingAlgorithm.getNext(requestId)
        if (available.has(candidate)) {
            return candidate
        }
    }
    return undefined
}

function startHealthChecks() {
    setInterval(() => {
        for (const serverId of serverFactory.getServers().keys()) {
            const serverUrl = serverFactory.getServerName(serverId)
            const healthRequest = http.get(`${serverUrl}/health`, { timeout: healthCheckTimeout }, response => {
                response.resume()
                const healthy = response.statusCode === 200
                serverFactory.setServerAvailability(serverId, healthy)
            })
            healthRequest.on("error", () => serverFactory.setServerAvailability(serverId, false))
            healthRequest.on("timeout", () => healthRequest.destroy())
        }
    }, healthCheckInterval)
}


class LeastConnections {
    constructor() {
        this.next = -1
    }

    getNext() {
        this.next = serverFactory.getServerWithMinConnectionsIndex()
        return this.next
    }
}

class RoundRobin {
    constructor(max) {
        this.next = -1
        this.max = max
    }

    getNext() {
        this.next = this.next + 1

        if (this.next >= this.max) {
            this.next = 0
        }
        return `S${this.next}`
    }
}

class ConsistentHashing {
    constructor(noservers_, replicas_) {
        this.noservers = noservers_
        this.replicas = replicas_
        this.hashmap = new Map()
      
        for (let i = 0; i < this.replicas; i++) {// replica
            for (let j = 0; j < this.noservers; j++) {

                let server_hash = crypto.createHash('md5').update(`__S${j}${i}`).digest('hex');
                this.hashmap.set(`__S${j}${i}`,server_hash)
            }
        }
    }

    addClient(requestid){
        if(!this.hashmap.has(requestid)){
            let request_hash = crypto.createHash('md5').update(requestid).digest('hex');
            this.hashmap.set(requestid,request_hash)
        }        
    }

    removeNode(nodeid){
        this.hashmap.delete(nodeid)
    }

    getNext(requestid){
        this.addClient(requestid)

        let serverid = undefined
        //sort by hashkeys
        const hashmap_sorted = new Map([...this.hashmap.entries()].sort((a, b) => a[1].localeCompare(b[1])));
        
        let rfound = false
        for (let [key, value] of hashmap_sorted) {
            if(key === requestid){
                rfound = true
            }

            if(rfound){
                if(key.startsWith("__S")){
                    serverid = removeN(key,2)
                    if(this.noservers < 10){
                        serverid = serverid.substring(0, 2);
                    }
                    else if(this.noservers <100){
                        serverid = serverid.substring(0, 3);
                    }
                    else if(this.noservers <1000){
                        serverid = serverid.substring(0, 4);
                    }//max of 999 servers

                    break
                }
            }
        }

        return serverid
    }

}

//util functions
const removeN = (str, num) => {
    const { length } = str;
    if(num > length){
       return str;
    };
    const newStr = str.substr(num, length - num);
    return newStr;
 };
