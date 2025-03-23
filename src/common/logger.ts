import { createLogger, format, transports } from "winston";

import { networkInterfaces } from "os";

/* eslint-disable @typescript-eslint/no-explicit-any */
const nets: any = networkInterfaces();
/* eslint-disable @typescript-eslint/no-explicit-any */
const results: any = {};

for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        if (net.family === "IPv4" && !net.internal) {
            if (!results[name]) {
                results[name] = [];
            }
            results[name].push(net.address);
        }
    }
}

const log = (level: "error" | "info" | "warn" | "debug") => {

    const logger = createLogger({
        exitOnError: false,
        level: "debug",
        format: format.combine(
            format.timestamp({
                format: "YYYY-MM-DD HH:mm:ss",
            }),
            format.json()
        ),
        transports: [
            new transports.Console(),
        ],
    });

    return (component: string, message: string) =>
        logger.log(level, message, {
            component,
            version: process.env.npm_package_version,
            networkInterfaces: results,
            railwaySnapshotId: process.env.RAILWAY_SNAPSHOT_ID,
        });
};

export const logger = {
    error: log("error"),
    info: log("info"),
    warn: log("warn"),
    debug: log("debug"),
};
