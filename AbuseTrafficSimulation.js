import http from "node:http";

const legitimateRequests = Number(process.argv[2] || 10);
const abusiveRequests = Number(process.argv[3] || 30);

function request(path) {
    return new Promise((resolve) => {
        http.get(`http://127.0.0.1:8080${path}`, response => {
            response.resume();
            response.on("end", () => resolve(response.statusCode));
        }).on("error", () => resolve(0));
    });
}

async function run() {
    let legitimateServed = 0;
    let abusiveRejected = 0;

    for (let i = 0; i < legitimateRequests; i++) {
        if ((await request(`/legitimate-${i}`)) === 200) {
            legitimateServed++;
        }
    }

    const abusive = await Promise.all(
        Array.from({ length: abusiveRequests }, (_, i) =>
            request(`/abusive-${i}-${"x".repeat(3000)}`))
    );
    abusiveRejected = abusive.filter(status => status === 413 || status === 429 || status === 0).length;

    console.log(`Legitimate requests served: ${legitimateServed}/${legitimateRequests}`);
    console.log(`Abusive requests rejected: ${abusiveRejected}/${abusiveRequests}`);
    console.log(`Abusive status codes: ${JSON.stringify(abusive.reduce((counts, status) => {
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
    }, {}))}`);
}

if (!Number.isInteger(legitimateRequests) || legitimateRequests < 1 ||
    !Number.isInteger(abusiveRequests) || abusiveRequests < 1) {
    console.error("Usage: node AbuseTrafficSimulation.js [legitimate] [abusive]");
    process.exitCode = 1;
} else {
    run();
}
