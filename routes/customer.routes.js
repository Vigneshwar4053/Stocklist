import { Router } from 'express';
import { body } from 'express-validator';
import { customerBuy } from "../controllers/customer.controller.js";
import { auth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";


const router = Router();


router.post(
'/buy',
auth,
requireRole('customer'),
[
body('sellerStocklistId').isString().notEmpty(),
body('items').isArray({ min: 1 }),
body('items.*.productId').isString().notEmpty(),
body('items.*.quantity').isInt({ gt: 0 }),
body('items.*.price').isFloat({ gt: 0 })
],
validate,
customerBuy
);


export default router;