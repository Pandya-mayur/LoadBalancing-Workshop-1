import Utils from "./Util.js";

const config = {
    LoadBalancingAlgorithm: Utils.AlgorithmStr[1],
    NoServers: 2,
    Replicas: 3,
    MaxNoSessionsPerServer: 10,
    MinNoSessionsPerServer: 1,
    MaxProcessingTime: 30000,
    MinProcessingTime: 2000,
    NoDatastores: 2,
    MaxDatastoreSpace: 1000000,
    MinDatastoreSpace: 100000,
    MaxSizeRequestPayload: 100000,
    MinSizeRequestPayload: 1000
};

export default config;
