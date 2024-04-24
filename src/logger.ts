import winston, { format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import serverConfig from "./config";
import { environment } from "./config";

const { combine, timestamp, printf, colorize } = format;

const consoleFormat = combine(
  colorize(), // Applies CLI color formatting.
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  printf((info) => {
    const message = typeof info.message === "object" ? JSON.stringify(info.message, null, 2) : info.message;
    return `[${info.timestamp}][${info.level}]: ${message}`;
  })
);

// File logging format without color codes.
const fileFormat = combine(
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  printf((info) => {
    const message = typeof info.message === "object" ? JSON.stringify(info.message, null, 2) : info.message;
    return `[${info.timestamp}][${info.level}]: ${message}`;
  })
);

const logger = winston.createLogger({
  level: serverConfig[environment].logLevel,
  transports: [
    new transports.Console({
      format: consoleFormat,
    }),
  ],
});

// Conditionally adding file transport if file logging is enabled
if (serverConfig[environment].enableFileLogging) {
  logger.add(
    new DailyRotateFile({
      filename: "logs/minting-api-backend-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
      format: fileFormat,
    })
  );
}

export default logger;
