/**
 * Rotas por hash (#/fatura). Cada tela vira uma entrada no histórico, então o
 * botão "voltar" do Android e do navegador funciona como esperado.
 */

import { useEffect, useState } from "react";

export const ROUTES = [
  "inicio",
  "fatura",
  "categorias",
  "planejar",
  "metas",
  "relatorios",
  "alivio",
  "contas",
  "resumo",
  "ajustes",
] as const;
export type Route = (typeof ROUTES)[number];

function parse(hash: string): Route {
  const name = hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : "inicio";
}

export function navigate(route: Route): void {
  if (parse(window.location.hash) !== route) window.location.hash = `/${route}`;
  window.scrollTo({ top: 0 });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
