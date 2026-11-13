/// <reference types="vite/client" />

/** Google Identity Services（https://accounts.google.com/gsi/client）用到的最小类型 */
interface GoogleCredentialResponse {
  credential: string;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize(options: {
          client_id: string;
          callback: (response: GoogleCredentialResponse) => void;
          auto_select?: boolean;
          ux_mode?: 'popup' | 'redirect';
        }): void;
        renderButton(
          parent: HTMLElement,
          options: { theme?: string; size?: string; text?: string; shape?: string; width?: number; locale?: string },
        ): void;
        disableAutoSelect(): void;
      };
    };
  };
}
