# System Design: Load Balancing Testbed
This is an implementation of a testbed for validating and optimizing load balancing in a system architectural design.

## Student details

**Name:** MAYURKUMAR SANJAYBHAI PANDYA  
**Email:** xt26225@bristol.ac.uk  
**Student number:** 2957655  
**Programme:** Cyber Security (Software Security) (MSc)  
**Level:** MSc  
**Course instructor:** Dr Inah Omoronyia

## Configuration

The default architectural configuration is in [config.js](D:/LoadB/LoadBalancing/config.js).
The terminal program copies these values and still allows them to be changed
for the current run. Start the program with:

```sh
node MainTerminal.js
```

The console displays the current configuration and lets you change its values before choosing `Y` to start the load balancer. Changes apply only to the current run; they are not saved when the program exits.

After you choose `Y`, the program prints a startup message for the load balancer, followed by one entry for each backend server it creates. Backend ports and server limits are selected at runtime, so their values can differ between runs. The output is similar to:

```text
LoadBalancer is running on http://127.0.0.1:8080
Server {
  name: 'http://127.0.0.1:<port>',
  id: 'S0',
  maxSessions: <value>,
  processTime: <value>,
  sessions: []
}
```

It then periodically prints status objects for the servers (`id`, `Server`, `MaxSessions`, `processTime`, `Active`, and `limitReached`) and datastores (`id`, `Name`, `MaxStorage`, and `StorageLeft`). These values change as requests are handled. The current implementation schedules a status-printing timer for each backend server, so the full status output may repeat multiple times per interval. The program keeps running to serve requests; stop it with `Ctrl+C`.

## Request simulation

Start the load balancer in one terminal, then run the simulator in a second terminal:

```powershell
node RequestSimulation.js
```

By default, the simulator sends 10 requests at each interval in the workshop
sequence (`500ms`, `450ms`, through `1ms`). It reports the number and percentage
of successful and failed sessions. To use a different number of requests at
each interval:

```powershell
node RequestSimulation.js 100
```

The number is the requests sent at every interval. For example, use `10` for
tens of requests, `100` for hundreds, and `1000` for a larger workload:

```powershell
node RequestSimulation.js 10
node RequestSimulation.js 100
node RequestSimulation.js 1000
```

The simulator treats a response containing `Session ACCESS GRANTED` as
successful. A denied response or connection error is counted as a failure. It
makes requests only to the local testbed at `http://127.0.0.1:8080`.

The configuration has the following shape:

 ```yaml
 config = {
        LoadBalancingAlgorithm: <value>,
        NoServers: <value>,
        Replicas: <value>,
        MaxNoSessionsPerServer: <value>,
        MinNoSessionsPerServer: <value>,
        MaxProcessingTime: <value>, //milliseconds in this implementation
        MinProcessingTime: <value>, //milliseconds in this implementation
        NoDatastores: <value>,
        MaxDatastoreSpace: <value>, //simulation storage units
        MinDatastoreSpace: <value>, //simulation storage units
        MaxSizeRequestPayload: <value>, //simulation payload units
        MinSizeRequestPayload: <value>, //simulation payload units
    }
```

## Recorded experiment results

The following results were recorded locally while changing the number of
servers and consistent-hashing replicas. The request simulator was run with:

```powershell
node RequestSimulation.js 10
```

The first completed run produced these results:

| Interval | Successful | Failed | Success rate | Failure rate |
|---:|---:|---:|---:|---:|
| 500 ms | 10 | 0 | 100% | 0% |
| 450 ms | 5 | 5 | 50% | 50% |
| 400 ms | 1 | 9 | 10% | 90% |
| 350 ms | 1 | 9 | 10% | 90% |
| 300 ms | 0 | 10 | 0% | 100% |
| 250 ms and below | 0 | 10 | 0% | 100% |

This shows that the system handled slow traffic successfully, but the failure
rate increased as requests arrived more quickly. The likely cause is that
backend sessions remain active for several seconds, so new requests are denied
when server session capacity is reached.

The following partial 100-request runs were also observed:

| Run | Interval reached | Successful | Failed | Result |
|---:|---:|---:|---:|---|
| 1 | 500 ms | 0 | 100 | Stopped with `Ctrl+C` |
| 2 | 500 ms | 16 | 84 | Stopped with `Ctrl+C` |
| 3 | 500 ms | 31 | 69 | Continued to 450 ms, then stopped |

These 100-request results are partial observations because the runs were
stopped early. The results are still useful as evidence that the configuration
became overloaded under a larger workload.

### Correct procedure for comparing configurations

For each configuration:

1. Stop the running server with `Ctrl+C`.
2. Start a new server with `node MainTerminal.js`.
3. Enter `Y` to use the selected configuration.
4. Wait until the load balancer and all backend servers are displayed.
5. Run `node RequestSimulation.js 10`.
6. Save the output or take a screenshot.
7. Repeat from step 1 for the next configuration.

The configurations tested should be recorded explicitly, for example:

| Configuration | Servers | Replicas | Workload | Notes |
|---|---:|---:|---:|---|
| A | 2 | 3 | 10 per interval | Baseline |
| B | 3 | 3 | 10 per interval | More backend capacity |
| C | 5 | 5 | 10 per interval | More backend capacity and hash replicas |

`Replicas` affects the consistent-hashing ring. It does not create additional
physical servers. Increasing `NoServers` increases backend processing capacity;
increasing `Replicas` mainly changes how requests are distributed by
consistent hashing.

### Why requests are denied

A request can be denied for two different capacity reasons:

1. **No available server session:** the selected server is already handling its
   maximum number of sessions.
2. **Insufficient datastore space:** the randomly generated request payload is
   larger than the remaining capacity in all datastores.

For example:

```text
Session ACCESS DENIED ... request space of 80554MB is not available in datastore
```

means that the datastore layer could not reserve the requested payload space.
The current testbed generates a random payload size for each request between
`MinSizeRequestPayload` and `MaxSizeRequestPayload`. It then attempts to save
that amount across the configured datastores. As successful requests consume
storage, later requests are more likely to fail because less space remains.

This explains why increasing `NoDatastores`, `MaxDatastoreSpace`, or
`MinDatastoreSpace` can improve results when datastore exhaustion is the main
failure cause. Increasing the number of servers does not add datastore
capacity, so it cannot by itself fix storage-related denials.

### Interpreting the results

For the report, compare the success rate at the same interval across
configurations. A configuration is better if it keeps a higher success rate as
the interval becomes smaller. More servers should normally improve capacity,
while more replicas alone should not be expected to increase total processing
capacity. A high failure rate at short intervals indicates that the system is
vulnerable to burst traffic and needs protections such as rate limiting,
request limits, timeouts, and health checks.

## Result evidence

The evidence collected during local testing is in
[Result-Evidence](./Result-Evidence/):

- [High-level design diagram](./Result-Evidence/_High-level%20design%20diagram.drawio%20%281%29.png)
- [Server and replica comparison](./Result-Evidence/Test%20result%20by%20chaging%20serverreplicas%20.png)
- [Datastore capacity result](./Result-Evidence/Datastore%20full%20with%20storage.png)
- [Fault-tolerance test](./Result-Evidence/fault%20tolerance%20TASK%20B.png)
- [Load-balancer health endpoint](./Result-Evidence/Health%20endpoint.png)
- [Rate-limit test](./Result-Evidence/per%20client%20max%20requst%2010%20TASKB.png)

These screenshots show the architecture, configuration experiments, datastore
capacity behaviour, health checks, backend failure recovery, and abusive
traffic protection.

The baseline run recorded 100% success at 500 ms, 50% at 450 ms, 10% at
400 ms, and 0% from 300 ms downwards. More servers should help when server
session capacity is the limiting resource. More datastores should help when
the error reports unavailable storage. Replicas should mainly change request
distribution for consistent hashing; they do not add physical servers.

For hundreds and thousands of requests, run:

```bash
node RequestSimulation.js 100
node RequestSimulation.js 1000
```

These runs are local stress tests and may take a long time because the simple
simulator waits between requests. Millions of requests were not generated on
the laptop. They were evaluated as a design case: serving that volume would
need horizontal autoscaling, multiple load balancers, replicated datastores,
queues or caching, monitoring, and upstream denial-of-service protection.

The simulator uses internally generated payload sizes rather than reading the
actual HTTP request body. The payload and datastore values are therefore
simulation units, which is stated here rather than presenting them as a real
storage measurement.

## Task B: fault tolerance

Fault tolerance is optional at startup so that the original configuration can
be compared with the protected configuration. Start the load balancer with:

```bash
FAULT_TOLERANCE=1 node MainTerminal.js
```

The health-check-enabled load balancer:

- exposes a `/health` endpoint on every backend server;
- checks each backend once per second;
- marks a backend unavailable after an unhealthy response or connection error;
- skips unavailable backends when selecting a destination;
- restores a backend when its health check returns `200`;
- returns `503` when no healthy backend is available; and
- returns `504` if a backend does not respond within the configured processing
  limit plus one second.

The public load-balancer health endpoint can be checked with:

```bash
curl http://127.0.0.1:8080/health
```

It returns:

```text
load balancer healthy
```

This endpoint does not create a session or consume datastore space. Individual
backends also expose `/health` on their dynamically assigned ports and return
either `healthy` or `unavailable`.

The failure scenario is controlled and local. With the fault-tolerant server
running, execute:

```bash
node FaultToleranceSimulation.js 20 5000
```

This sends a baseline workload, marks `S0` unavailable for five seconds, sends
the same workload during the failure, waits for health checks to observe
recovery, and sends the workload again. The script reports successful and
failed requests for each phase and the approximate recovery time. The first
argument is the number of requests per phase; the second is the simulated
failure duration in milliseconds.

If a normal session request reports:

```text
request space ... is not available in datastore
```

that is a datastore-capacity failure, not a health-check failure. Start a
fresh testbed with enough datastore capacity for the fault-tolerance workload.
The `/health` command itself does not use datastore space.

For the comparison without fault tolerance, start the server normally:

```bash
node MainTerminal.js
```

Then run the same simulation. In that run, the load balancer does not perform
health checks or remove failed backends from rotation, so requests routed to
the unavailable backend fail until the backend is restored.

### Fault-tolerance evaluation

Record the output in a table like this:

| Mode | Phase | Requests | Successful | Failed | Recovery time |
|---|---|---:|---:|---:|---:|
| Disabled | Baseline | 20 | | | Not applicable |
| Disabled | During S0 failure | 20 | | | Not recovered by health checks |
| Enabled | Baseline | 20 | | | Not applicable |
| Enabled | During S0 failure | 20 | | | Approximately 1-2 health-check intervals |
| Enabled | After recovery | 20 | | | Approximately failure duration + detection delay |

The expected result is that fault tolerance reduces failures during the
failure window when another healthy backend is available. There is a trade-off:
health checks create extra local requests every second, and a backend can
remain out of rotation until the next successful health check. If all
backends fail, health checks cannot create capacity and the load balancer must
return `503`.

This scenario demonstrates failure detection and recovery; it is not a
production-grade high-availability implementation. A production design would
also use multiple load-balancer instances, persistent health state, replicated
datastores, retries with limits, and monitoring.

```text
Client
  |
  v
Load balancer -- health checks every 1 second --> Backend S0
  |                                             Backend S1
  |                                             Backend S2
  |
  +-------------------------------------------> Datastore pool

If a backend returns unhealthy or times out, the load balancer removes it from
selection. When the backend answers `/health` with HTTP 200 again, it is
returned to the rotation.
```

### Example fault-tolerance result

With three backends, 20 sessions per backend, 100 ms processing time, and a
controlled two-second S0 failure, one local run produced:

| Phase | Successful | Failed |
|---|---:|---:|
| Baseline | 5 | 0 |
| During S0 failure | 5 | 0 |
| After recovery | 5 | 0 |

The recovery check was observed after approximately 3.5 seconds in that run.
The exact timing varies because health checks run on a one-second interval and
local scheduling affects when the recovery is observed. The zero failures
during the failure phase demonstrate the benefit of removing S0 from rotation
while S1 and S2 remain healthy.

## Task B2: abusive traffic

For this part I used two simple attack cases. The first sends a burst of
requests from one client. The second sends a request path that is much larger
than a normal request. In a real application the same idea would apply to a
large request body.

The resources at risk are:

- backend session slots;
- datastore space;
- CPU and network connections; and
- response time for ordinary users.

The possible attack paths are repeated requests, very large requests, and
requests that stay open for too long.

The defences are kept off by default so that the two cases can be compared.
The protected mode uses a limit of 10 requests per client in one second, rejects
URLs or declared request bodies over 2048 bytes, and uses the existing backend
timeout. A rejected request receives HTTP `429` for the rate limit or HTTP
`413` for the size limit.

Start the unprotected version:

```bash
node MainTerminal.js
```

In another terminal run:

```bash
node AbuseTrafficSimulation.js 10 30
```

Then stop the server and run the protected version:

```bash
DEFENCES=1 node MainTerminal.js
```

Run the same simulator again:

```bash
node AbuseTrafficSimulation.js 10 30
```

The first number is the number of ordinary requests. The second is the number
of burst/large requests. The script prints how many ordinary requests were
served and how many abusive requests were rejected.

Use a table like this for the results:

| Mode | Legitimate served | Abusive rejected | Main observation |
|---|---:|---:|---|
| Defences off | 10/10 | 0/30 | All 30 oversized burst requests reached the system and returned 200 |
| Defences on | 10/10 | 30/30 | All 30 oversized requests were rejected with 413 before reaching a backend |

I ran the same workload locally with three backend servers and large datastore
capacity. With defences disabled the output was:

```text
Legitimate requests served: 10/10
Abusive requests rejected: 0/30
Abusive status codes: {"200":30}
```

With `DEFENCES=1` enabled the output was:

```text
Legitimate requests served: 10/10
Abusive requests rejected: 30/30
Abusive status codes: {"413":30}
```

The protected run kept all legitimate requests successful and rejected every
oversized abusive request. This particular run measured the size defence; a
separate burst of normal-sized requests is needed to measure the `429` rate
limit response.

I also tested a larger workload using:

```bash
node AbuseTrafficSimulation.js 50 30
```

The observed output was:

```text
Legitimate requests served: 10/50
Abusive requests rejected: 30/30
Abusive status codes: {"413":30}
```

This happened because the defences were enabled and the rate limit allows a
maximum of 10 requests from one client during a one-second window. Therefore,
only the first 10 legitimate requests were accepted and the remaining
legitimate requests were rate-limited. All 30 abusive requests were rejected
by the request-size check because their URLs were larger than the 2048-byte
limit. This result shows that the defences protect the system, but a strict
rate limit can also affect legitimate users when they send many requests
quickly.

The expected result is that the protected run rejects the oversized requests
before they reach a backend and limits the burst. This leaves more capacity for
ordinary requests. The disadvantage is that a strict limit can reject genuine
users during a busy period, and keeping rate-limit counters uses a small amount
of memory. The test is run against `127.0.0.1` only; it does not send traffic
to an external system.
