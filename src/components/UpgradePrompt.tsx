/**
 * UpgradePrompt — disabled for BarkFlow (local-first, no Pro tier).
 * Kept as a no-op to avoid breaking imports.
 */

interface UpgradePromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wordsUsed?: number;
  limit?: number;
}

export default function UpgradePrompt(_props: UpgradePromptProps) {
  return null;
}
