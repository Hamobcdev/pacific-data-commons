import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware drop-ins for next/link's Link and next/navigation's
 * redirect/useRouter/usePathname (Session 8.2). Every internal Link/router
 * call in the app must import from here instead of next/link or
 * next/navigation directly, now that routes live under app/[locale]/ and
 * every href needs the current locale prefixed onto it.
 */
export const { Link, redirect, permanentRedirect, useRouter, usePathname, getPathname } = createNavigation(routing);
