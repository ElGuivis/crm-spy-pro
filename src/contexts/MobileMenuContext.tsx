import { createContext, useContext } from "react";

/** Abre o menu principal no celular (o MainLayout é quem controla). Páginas em tela cheia, como Atendimentos, usam isto no próprio cabeçalho. */
const MobileMenuContext = createContext<() => void>(() => {});

export const MobileMenuProvider = MobileMenuContext.Provider;
export const useOpenMobileMenu = () => useContext(MobileMenuContext);
