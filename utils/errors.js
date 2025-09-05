export class AppError extends Error {
    constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
    }
    }
    
    
    export function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
    }