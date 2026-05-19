export const isRazorpayConfigured = () => {
  const key = process.env.Razorpay_Key?.trim();
  const secret = process.env.Razorpay_Secret?.trim();

  return Boolean(
    key &&
      secret &&
      !key.toLowerCase().includes("your") &&
      !secret.toLowerCase().includes("your")
  );
};

export const isDevPaymentOrder = (orderId: string) =>
  orderId.startsWith("order_dev_");
