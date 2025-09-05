import { validationResult } from 'express-validator';
import { AppError } from '../utils/errors.js';


export function validate(req, _res, next) {
const result = validationResult(req);
if (!result.isEmpty()) {
throw new AppError(422, 'Validation failed', result.array());
}
next();
}