import React, { useState } from "react";
import { Eye, EyeOff, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { resetPassword, authConfigured } from "../../lib/auth";

export default function AuthGate({ marketers, onLogin, onSignup }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (!email.trim() || !email.includes("@")) return setMsg({ type: "error", text: "נא להזין כתובת אימייל תקינה" });
    if (!password || password.length < 6) return setMsg({ type: "error", text: "הסיסמה חייבת להכיל לפחות 6 תווים" });
    if (mode === "signup" && !name.trim()) return setMsg({ type: "error", text: "נא להזין שם" });
    setLoading(true);
    try {
      if (mode === "login") await onLogin(email.trim(), password);
      else await onSignup(email.trim(), password, name.trim());
    } catch (err) {
      setMsg({ type: "error", text: err.message || "שגיאה בהתחברות" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (!forgotEmail.trim() || !forgotEmail.includes("@")) return setMsg({ type: "error", text: "נא להזין כתובת אימייל תקינה" });
    setLoading(true);
    try {
      if (authConfigured) {
        const res = await resetPassword(forgotEmail.trim());
        if (!res.ok) throw new Error(res.error);
      }
      setForgotSent(true);
      setMsg({ type: "success", text: "קישור לאיפוס סיסמה נשלח לאימייל שלך" });
    } catch (err) {
      setMsg({ type: "error", text: err.message || "שגיאה בשליחת קישור" });
    } finally {
      setLoading(false);
    }
  };