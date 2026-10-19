import http from "node:http";

const intervals = [500, 450, 400, 350, 300, 250, 200, 150, 100, 50, 30, 20, 15, 10, 5, 1];
const REQUESTS_PER_INTERVAL = Number(process.argv[2] || 10);

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sendRequest(number) {
    return new Promise((resolve) => {
        http.get(`http://127.0.0.1:8080/request-${number}`, (response) => {
            let result = "";

            response.on("data", (chunk) => {
                result += chunk;
            });

            response.on("end", () => {
                resolve(result.includes("Session ACCESS GRANTED"));
            });
        }).on("error", () => {
            resolve(false);
        });
    });
}

async function testInterval(interval) {
    let successful = 0;

    for (let request = 1; request <= REQUESTS_PER_INTERVAL; request++) {
        if (await sendRequest(request)) {
            successful++;
        }

        await wait(interval);
    }

    const failed = REQUESTS_PER_INTERVAL - successful;
    const successRate = (successful / REQUESTS_PER_INTERVAL) * 100;
    const failureRate = (failed / REQUESTS_PER_INTERVAL) * 100;

    console.log(
        `${interval}ms: ` +
        `${successful} successful, ${failed} failed | ` +
        `success rate: ${successRate.toFixed(2)}% | ` +
        `failure rate: ${failureRate.toFixed(2)}%`
    );
}

async function simulateRequests() {
    if (!Number.isInteger(REQUESTS_PER_INTERVAL) || REQUESTS_PER_INTERVAL < 1) {
        console.error("Use a positive whole number of requests, for example: node RequestSimulation.js 10");
        process.exitCode = 1;
        return;
    }

    console.log(`Sending ${REQUESTS_PER_INTERVAL} requests at each interval...\n`);

    for (const interval of intervals) {
        await testInterval(interval);
    }
}

simulateRequests();
