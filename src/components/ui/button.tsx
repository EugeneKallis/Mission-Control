import { type ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "ghost", className = "", children, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200";

    const variants: Record<ButtonVariant, string> = {
      primary:
        "bg-gradient-to-br from-primary-fixed to-primary text-on-primary hover:shadow-[0_0_16px_2px_rgba(34,211,238,0.2)] active:scale-[0.98]",
      ghost:
        "bg-transparent text-primary border border-primary/20 hover:border-primary hover:bg-primary/5 active:scale-[0.98]",
      danger:
        "border text-error border-error/30 hover:bg-error/10 active:scale-[0.98]",
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
