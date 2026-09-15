import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type Membership = {
  role: string;
  status: string;
};

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/registro",
  "/suscribirse",
  "/crear-contrasena",
  "/recuperar-contrasena",
];

function isSameOrChildRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) =>
    isSameOrChildRoute(pathname, route)
  );
}

function isPanelRoute(pathname: string) {
  return isSameOrChildRoute(pathname, "/panel");
}

function isRRPPRoute(pathname: string) {
  return isSameOrChildRoute(pathname, "/rrpp");
}

function isAdminRoute(pathname: string) {
  return isSameOrChildRoute(pathname, "/admin");
}

function isControlRoute(pathname: string) {
  return isSameOrChildRoute(pathname, "/control");
}

function isDoorRoute(pathname: string) {
  return isSameOrChildRoute(pathname, "/puerta");
}

function isPrivateRoute(pathname: string) {
  return (
    isSameOrChildRoute(pathname, "/cuenta") ||
    isPanelRoute(pathname) ||
    isRRPPRoute(pathname) ||
    isAdminRoute(pathname) ||
    isControlRoute(pathname) ||
    isDoorRoute(pathname)
  );
}

function redirectKeepingCookies(
  request: NextRequest,
  responseWithCookies: NextResponse,
  pathname: string
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const redirectResponse = NextResponse.redirect(url);

  responseWithCookies.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return redirectResponse;
}

function roleDestination(memberships: Membership[]) {
  const isOrganizer = memberships.some(
    (membership) => membership.role === "organizer"
  );

  const isRRPP = memberships.some(
    (membership) => membership.role === "rrpp"
  );

  const isController = memberships.some(
    (membership) => membership.role === "controller"
  );

  const isDoorSeller = memberships.some(
    (membership) => membership.role === "door_seller"
  );

  if (isOrganizer) {
    return "/panel";
  }

  if (isController) {
    return "/control";
  }

  if (isRRPP) {
    return "/rrpp";
  }

  if (isDoorSeller) {
    return "/puerta";
  }

  return "/cuenta";
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const pathname = request.nextUrl.pathname;

  if (!supabaseUrl || !supabaseKey) {
    if (isPrivateRoute(pathname)) {
      return redirectKeepingCookies(
        request,
        supabaseResponse,
        "/login"
      );
    }

    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(
            ({ name, value, options }) => {
              supabaseResponse.cookies.set(
                name,
                value,
                options
              );
            }
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isPrivateRoute(pathname)) {
      return redirectKeepingCookies(
        request,
        supabaseResponse,
        "/login"
      );
    }

    return supabaseResponse;
  }

  if (!isPrivateRoute(pathname) && !isPublicRoute(pathname)) {
    return supabaseResponse;
  }

  const {
    data: membershipsData,
    error: membershipError,
  } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    console.error(
      "Error verificando roles:",
      membershipError
    );
  }

  const memberships =
    (membershipsData ?? []) as Membership[];

  const destination =
    roleDestination(memberships);

  const hasRole = (role: string) =>
    memberships.some(
      (membership) => membership.role === role
    );

  if (pathname === "/login" || pathname === "/registro") {
    return redirectKeepingCookies(
      request,
      supabaseResponse,
      destination
    );
  }

  if (isPanelRoute(pathname) && !hasRole("organizer")) {
    return redirectKeepingCookies(
      request,
      supabaseResponse,
      destination
    );
  }

  if (isRRPPRoute(pathname) && !hasRole("rrpp")) {
    return redirectKeepingCookies(
      request,
      supabaseResponse,
      destination
    );
  }

  if (isControlRoute(pathname) && !hasRole("controller")) {
    return redirectKeepingCookies(
      request,
      supabaseResponse,
      destination
    );
  }

  if (isDoorRoute(pathname) && !hasRole("door_seller")) {
    return redirectKeepingCookies(
      request,
      supabaseResponse,
      destination
    );
  }

  if (isAdminRoute(pathname)) {
    return supabaseResponse;
  }

  return supabaseResponse;
}
