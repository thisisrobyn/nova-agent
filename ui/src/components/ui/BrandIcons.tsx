/* Brand logo marks for LLM providers (monochrome, inherit currentColor)
   and for connectable external services (full brand colors). */

interface IconProps {
  className?: string;
}

export function OllamaIcon({ className }: IconProps) {
  // Ollama's llama — two tall ears, rounded body, and two visible eye holes
  // (punched out via the even-odd fill rule so they read as eyes).
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      className={className}
      aria-hidden="true"
    >
      <path d="M7.4 2.6c.62 0 1.02.55 1.15 1.35.06.4.09.86.1 1.45.5-.15 1.05-.23 1.65-.26.5-.02 1 0 1.7 0s1.2-.02 1.7 0c.6.03 1.15.11 1.65.26.01-.59.04-1.05.1-1.45.13-.8.53-1.35 1.15-1.35.72 0 1.2.74 1.2 1.95 0 .78-.06 1.5-.2 2.13.98.74 1.6 1.9 1.7 3.29.03.4.03 1.15 0 1.6-.06.83-.3 1.55-.66 2.06v3.06c0 2.2-1.5 3.9-3.75 3.9-.35 0-.55.13-.62.4-.05.2 0 .43.2.66.5.55.8 1.3.8 2.2v.15h-1.85v-.15c0-.35-.1-.5-.35-.6-.2-.08-.35-.08-2.15-.08s-1.95 0-2.15.08c-.25.1-.35.25-.35.6v.15H6.2v-.15c0-.9.3-1.65.8-2.2.2-.23.25-.46.2-.66-.07-.27-.27-.4-.62-.4-2.25 0-3.75-1.7-3.75-3.9v-3.06c-.36-.51-.6-1.23-.66-2.06-.03-.45-.03-1.2 0-1.6.1-1.39.72-2.55 1.7-3.29-.14-.63-.2-1.35-.2-2.13 0-1.21.48-1.95 1.2-1.95Zm2.35 8.7a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Zm4.5 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Z"/>
    </svg>
  );
}

export function OpenAIIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
    </svg>
  );
}

export function AnthropicIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.541Zm-.3712 10.223 2.2914-5.9456 2.2914 5.9456Z"/>
    </svg>
  );
}

/* ── External services ────────────────────────────────────── */

/**
 * Service marks render in brand colors by default. Pass `mono` to draw them
 * in `currentColor` instead, which is how connection state is signalled
 * (grey when disconnected, green when connected).
 */
interface ServiceIconProps extends IconProps {
  mono?: boolean;
}

export function GoogleIcon({ className, mono }: ServiceIconProps) {
  const c = (brand: string) => (mono ? 'currentColor' : brand);
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill={c('#4285F4')} d="M23.52 12.273c0-.851-.076-1.67-.218-2.455H12v4.642h6.458a5.52 5.52 0 0 1-2.394 3.622v3.01h3.878c2.269-2.089 3.578-5.165 3.578-8.818z"/>
      <path fill={c('#34A853')} d="M12 24c3.24 0 5.956-1.075 7.942-2.908l-3.878-3.01c-1.075.72-2.45 1.145-4.064 1.145-3.126 0-5.772-2.11-6.717-4.947H1.276v3.108A11.995 11.995 0 0 0 12 24z"/>
      <path fill={c('#FBBC05')} d="M5.283 14.28a7.212 7.212 0 0 1 0-4.56V6.612H1.276a11.998 11.998 0 0 0 0 10.776l4.007-3.108z"/>
      <path fill={c('#EA4335')} d="M12 4.773c1.762 0 3.344.606 4.589 1.795l3.442-3.442C17.951 1.19 15.235 0 12 0 7.31 0 3.255 2.69 1.276 6.612l4.007 3.108C6.228 6.883 8.874 4.773 12 4.773z"/>
    </svg>
  );
}

export function MicrosoftIcon({ className, mono }: ServiceIconProps) {
  const c = (brand: string) => (mono ? 'currentColor' : brand);
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill={c('#F25022')} d="M0 0h11.377v11.377H0z"/>
      <path fill={c('#7FBA00')} d="M12.623 0H24v11.377H12.623z"/>
      <path fill={c('#00A4EF')} d="M0 12.623h11.377V24H0z"/>
      <path fill={c('#FFB900')} d="M12.623 12.623H24V24H12.623z"/>
    </svg>
  );
}

export function GitHubIcon({ className }: ServiceIconProps) {
  // Always monochrome — GitHub's mark adapts to the surrounding theme, so the
  // `mono` prop is accepted for a uniform signature but changes nothing.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  );
}
