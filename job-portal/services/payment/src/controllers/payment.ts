import { TryCatch } from "../utils/TryCatch.js";
import { AuthenticatedRequest } from "../middlewares/auth.js";
import ErrorHandler from "../utils/errorHandler.js";
import { sql } from "../utils/db.js";
import { instance } from "../index.js";
import crypto from "crypto";
import {
  isDevPaymentOrder,
  isRazorpayConfigured,
} from "../utils/razorpay.js";

const SUBSCRIPTION_AMOUNT_PAISE = 119 * 100;

export const checkOut = TryCatch(async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    throw new ErrorHandler(401, "No valid User");
  }

  const user_id = req.user.user_id;

  const [user] = await sql`SELECT * FROM users WHERE user_id = ${user_id}`;

  const subTime = user?.subscription
    ? new Date(user.subscription).getTime()
    : 0;

  const now = Date.now();

  const isSubscribed = subTime > now;

  if (isSubscribed) {
    throw new ErrorHandler(400, "You already have a subscription");
  }

  if (!isRazorpayConfigured()) {
    const mockOrder = {
      id: `order_dev_${user_id}_${Date.now()}`,
      amount: SUBSCRIPTION_AMOUNT_PAISE,
      currency: "INR",
    };

    return res.status(201).json({
      order: mockOrder,
      devMode: true,
      message:
        "Razorpay keys not configured. Using local dev checkout. Add Razorpay_Key and Razorpay_Secret to services/payment/.env for real payments.",
    });
  }

  const options = {
    amount: SUBSCRIPTION_AMOUNT_PAISE,
    currency: "INR",
    notes: {
      user_id: user_id.toString(),
    },
  };

  try {
    const order = await instance.orders.create(options);

    res.status(201).json({
      order,
      devMode: false,
    });
  } catch (error: any) {
    const message =
      error?.error?.description ||
      error?.message ||
      "Failed to create Razorpay order. Check your Razorpay API keys.";
    throw new ErrorHandler(500, message);
  }
});

export const paymentVerification = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const user = req.user;

    if (!user) {
      throw new ErrorHandler(401, "No valid User");
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new ErrorHandler(400, "Payment verification data is missing");
    }

    const isDevCheckout =
      !isRazorpayConfigured() &&
      isDevPaymentOrder(razorpay_order_id) &&
      razorpay_signature === "dev_mode";

    let isAuthentic = false;

    if (isDevCheckout) {
      isAuthentic = true;
    } else if (isRazorpayConfigured()) {
      const body = razorpay_order_id + "|" + razorpay_payment_id;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.Razorpay_Secret as string)
        .update(body)
        .digest("hex");

      isAuthentic = expectedSignature === razorpay_signature;
    } else {
      throw new ErrorHandler(
        500,
        "Razorpay is not configured. Add API keys to services/payment/.env"
      );
    }

    if (isAuthentic) {
      const now = new Date();

      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      const expiryDate = new Date(now.getTime() + thirtyDays);

      const [updatedUser] =
        await sql`UPDATE users SET subscription = ${expiryDate} WHERE user_id = ${user.user_id} RETURNING *`;

      res.json({
        message: "Subscription Purchased Successfully",
        updatedUser,
      });
    } else {
      return res.status(400).json({
        message: "Payment Failed",
      });
    }
  }
);
