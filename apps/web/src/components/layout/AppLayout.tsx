import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useApiQuery } from "../../api/hooks";
import { Badge } from "../ui/Badge";
import { visibleNavItems } from "./navConfig";
import { ThemeToggle } from "./ThemeToggle";

interface Notification {
  id: string;
  read: boolean;
}

const ROLE_BADGE_VARIANT: Record<
  string,
  "default" | "info" | "success" | "warning" | "purple"
> = {
  ADMIN: "danger" as never,
  HR: "info",
  HIRING_MANAGER: "success",
  PROJECT_MANAGER: "warning",
  INTERVIEWER: "default",
  LEADERSHIP: "purple",
};

export function AppLayout() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const role = me?.role ?? "";

  const { data: notifications } = useApiQuery<Notification[]>(
    ["notifications", "unread"],
    "/notifications?unreadOnly=true",
  );
  const unreadCount = notifications?.length ?? 0;

  const navItems = visibleNavItems(role);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="px-4 py-5 border-b border-sidebar-border">
          <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tracking-tight">
            Picode HR
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                [
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                ].join(" ")
              }
            >
              {item.label}
              {item.path === "/notifications" && unreadCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 shrink-0 bg-card border-b border-border flex items-center justify-between px-6">
          <div />
          <div className="flex items-center gap-4">
            <ThemeToggle />

            {/* Notifications bell */}
            <button
              onClick={() => navigate("/notifications")}
              className="relative p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
              )}
            </button>

            {/* User info */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:block">
                {me?.email}
              </span>
              <Badge variant={ROLE_BADGE_VARIANT[role] ?? "default"}>
                {role}
              </Badge>
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-accent transition-colors"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
