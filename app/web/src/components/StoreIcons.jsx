import React from 'react';

// Os logótipos das lojas de apps e dos sistemas, para os botões que levam a elas (página /app e
// «Continuar com a Apple»). Cada um aparece só no botão que leva à loja dele: o da Google Play
// num APK descarregado do site dizia que a app vinha da loja, e não vem.

/** O logótipo da Apple (App Store, TestFlight, «Iniciar sessão com a Apple»). */
export const AppleIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
  </svg>
);

/** O logótipo da Google Play: o triângulo de quatro cores. */
export const GooglePlayIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#00C3FF" d="M1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924z" />
    <path fill="#00F076" d="M13.544 10.989l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973z" />
    <path fill="#FF3A44" d="M13.544 13.056l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z" />
    <path fill="#FFCE00" d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594z" />
  </svg>
);

/** O boneco do Android (o sistema, não a loja): para o APK que se descarrega do site. */
export const AndroidIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.523 15.341a1 1 0 1 1 0-1.999 1 1 0 0 1 0 1.999m-11.046 0a1 1 0 1 1 0-1.999 1 1 0 0 1 0 1.999m11.405-6.02 1.997-3.459a.416.416 0 0 0-.72-.416l-2.022 3.503C15.59 8.244 13.853 7.851 12 7.851s-3.59.393-5.137 1.099L4.841 5.447a.416.416 0 0 0-.72.415l1.998 3.46C2.689 11.187.343 14.659 0 18.761h24c-.344-4.102-2.689-7.574-6.118-9.44" />
  </svg>
);
