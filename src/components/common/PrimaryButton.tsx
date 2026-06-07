import type { ButtonHTMLAttributes } from "react";

export function PrimaryButton({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return <button {...props} className={`button ${variant} ${className}`} />;
}
