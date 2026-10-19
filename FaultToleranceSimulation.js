import http from "node:http";

const requestCount = Number(process.argv[2] || 20);
const failureDuration = Number(process.argv[3] || 5000);

function request(path) {
    return new Promise((resolve) => {
        http.get(`http://127.0.0.1:8080${path}`, (response) => {
            response.resume();
            let body = "";
            response.on("data", (chunk) => {
                body += chunk;
            });
            response.on("end", () => resolve({
                successful: response.statusCode === 200 &&
                    body.includes("Session ACCESS GRANTED"),
                body
            }));
        }).on("error", () => resolve({ successful: false, body: "" }));
    });
}

async function sendRequests(count) {
    let successful = 0;
    for (let i = 0; i < count; i++) {
        const result = await request(`/fault-test-${i}`)
        if (result.successful) {
            successful++;
        }
    }
    return { successful, failed: count - successful };
}

async function run() {
    console.log("Baseline workload");
    console.log(await sendRequests(requestCount));

    console.log(`Failing S0 for ${failureDuration}ms`);
    const failureStarted = Date.now();
    await request(`/__test/fail/S0?duration=${failureDuration}`);
    const duringFailure = await sendRequests(requestCount);
    console.log("During failure:", duringFailure);

    await new Promise((resolve) => setTimeout(resolve, failureDuration + 1500));
    const recoveryTime = Date.now() - failureStarted;
    const afterRecovery = await sendRequests(requestCount);
    console.log("After recovery:", afterRecovery);
    console.log(`Recovery observed after approximately ${recoveryTime}ms`);
}

if (!Number.isInteger(requestCount) || requestCount < 1 ||
    !Number.isInteger(failureDuration) || failureDuration < 1) {
    console.error("Usage: node FaultToleranceSimulation.js [requests] [failure-duration-ms]");
    process.exitCode = 1;
} else {
    run();
}
