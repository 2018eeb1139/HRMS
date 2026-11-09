import { useEffect, useState } from "react";
import { loginUrl, apiGet, apiSend, setToken } from "../api/client";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui";
import { ThemeToggle } from "../components/layout/ThemeToggle";

type DevUser = { email: string; name: string; role: string };

export function Login() {
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const [devError, setDevError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState("");

  useEffect(() => {
    apiGet<DevUser[]>("/auth/dev-users")
      .then(setDevUsers)
      .catch(() => {
        /* flag off or network error — silently render nothing */
      });
  }, []);

  async function handleDevLogin(email: string) {
    setDevError(null);
    try {
      const data = await apiSend<{ token: string }>("/auth/dev-login", "POST", {
        email,
      });
      setToken(data.token);
      window.location.reload();
    } catch (err) {
      setDevError(err instanceof Error ? err.message : "Login failed");
    }
  }

  const devUserItems = [
    { value: "", label: "Demo Users" },
    ...devUsers.map((u) => ({
      value: u.email,
      label: `${u.name} — ${u.role}`,
    })),
  ];

  return (
    <div className="relative grid place-items-center h-screen bg-background">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-96 border border-border bg-card p-6 rounded-lg text-center space-y-6 shadow-xs">
        <h1 className="text-foreground">Picode HR</h1>

        {devUsers.length > 0 && (
          <div className="space-y-6">
            <Select
              items={devUserItems}
              value={selectedEmail}
              onValueChange={(value) => setSelectedEmail(value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {devUserItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full bg-indigo-500 text-white hover:bg-indigo-600"
              disabled={!selectedEmail}
              onClick={() => handleDevLogin(selectedEmail)}
            >
              Login
            </Button>
            {devError && (
              <p className="text-red-500 text-[0.85rem]">{devError}</p>
            )}
          </div>
        )}

        <a href={loginUrl} className="block">
          <Button variant="outline" className="w-full">
            Sign in with Google
          </Button>
        </a>
      </div>
    </div>
  );
}
