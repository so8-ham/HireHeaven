"use client";
import useRazorpay from "@/components/scriptLoader";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import Cookies from "js-cookie";
import axios from "axios";
import { payment_service, useAppData } from "@/context/AppContext";
import toast from "react-hot-toast";
import Loading from "@/components/loading";
import { Card } from "@/components/ui/card";
import { CheckCircle, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

const RAZORPAY_KEY =
  process.env.NEXT_PUBLIC_RAZORPAY_KEY || "rzp_test_RaL8PDo9YBejEW";

const SubscriptionPage = () => {
  const razorpayLoaded = useRazorpay();

  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const { setUser } = useAppData();

  const handleSubscribe = async () => {
    const token = Cookies.get("token");

    if (!token) {
      toast.error("Please login first");
      router.push("/login");
      return;
    }

    setLoading(true);

    try {
      const { data } = await axios.post(
        `${payment_service}/api/payment/checkout`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const { order, devMode } = data;

      if (devMode) {
        const { data: verifyData } = await axios.post(
          `${payment_service}/api/payment/verify`,
          {
            razorpay_order_id: order.id,
            razorpay_payment_id: `pay_dev_${Date.now()}`,
            razorpay_signature: "dev_mode",
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        toast.success(verifyData.message);
        setUser(verifyData.updatedUser);
        router.push(`/payment/success/${order.id}`);
        return;
      }

      const options = {
        key: RAZORPAY_KEY,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "Hire Heaven",
        description: "Find job easily",
        order_id: order.id,
        handler: async function (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) {
          const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
            response;

          try {
            const { data: verifyData } = await axios.post(
              `${payment_service}/api/payment/verify`,
              { razorpay_order_id, razorpay_payment_id, razorpay_signature },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            toast.success(verifyData.message);
            setUser(verifyData.updatedUser);
            router.push(`/payment/success/${razorpay_payment_id}`);
          } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(
              err.response?.data?.message || "Payment verification failed"
            );
          } finally {
            setLoading(false);
          }
        },
        theme: {
          color: "#F37254",
        },
      };

      if (!razorpayLoaded) {
        toast.error("Razorpay failed to load. Please refresh the page.");
        return;
      }

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading />;
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-secondary/30">
      <Card className="max-w-md w-full p-8 text-center shadow-lg border-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900 mb-4">
          <Crown size={32} className="text-blue-600" />
        </div>

        <h1 className="text-3xl font-bold mb-2">Premium Subscription</h1>
        <p className="text-sm opacity-70 mb-6">Boost your job search</p>

        <div className="mb-6">
          <p className="text-5xl font-bold text-blue-600">₹ 119</p>
          <p className="text-sm opacity-60 mt-1">Per month</p>
        </div>

        <div className="space-y-3 mb-8 text-left">
          <div className="flex items-start gap-3">
            <CheckCircle size={20} className="text-green-600 shrink-0 mt-0.5" />
            <p className="text-sm">
              Your application will be shown first to recruiters
            </p>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle size={20} className="text-green-600 shrink-0 mt-0.5" />
            <p className="text-sm">Priority support</p>
          </div>
        </div>

        <Button
          onClick={handleSubscribe}
          className="w-full h-12 text-base gap-2"
        >
          <Crown size={18} /> Subscribe Now
        </Button>
      </Card>
    </div>
  );
};

export default SubscriptionPage;
