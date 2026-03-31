import { ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import logoIcon from "../assets/mando-head.svg";

interface AuthenticationStepProps {
  onContinueWithoutAccount: () => void;
  /** @deprecated Kept for interface compatibility; WhisperWoof removed cloud auth. */
  onAuthComplete?: () => void;
  /** @deprecated Kept for interface compatibility; WhisperWoof removed cloud auth. */
  onNeedsVerification?: (email: string) => void;
}

/**
 * AuthenticationStep — WhisperWoof welcome screen.
 * Cloud auth removed; this is a simple entry point that calls onContinueWithoutAccount.
 */
export default function AuthenticationStep({
  onContinueWithoutAccount,
}: AuthenticationStepProps) {
  return (
    <div className="space-y-3">
      <div className="text-center mb-4">
        <img
          src={logoIcon}
          alt="WhisperWoof"
          className="w-12 h-12 mx-auto mb-2.5 rounded-lg shadow-sm"
        />
        <p className="text-lg font-semibold text-foreground tracking-tight leading-tight">
          Welcome to WhisperWoof
        </p>
        <p className="text-muted-foreground text-sm mt-1 leading-tight">
          Voice-first personal automation. Speak and it transcribes, polishes, and routes — all
          locally.
        </p>
      </div>

      <Button onClick={onContinueWithoutAccount} className="w-full h-9">
        <span className="text-sm font-medium">Get Started</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
