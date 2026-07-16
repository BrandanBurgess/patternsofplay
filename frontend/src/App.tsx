import { useCallback, useEffect, useState } from "react";
import { MeOut, fetchMe, logout as apiLogout } from "./api";
import { AuthForms } from "./AuthForms";
import { TeamDashboard } from "./TeamDashboard";
import { TeamOnboarding } from "./TeamOnboarding";

export default function App() {
  const [me, setMe] = useState<MeOut | null>(null);

  const refreshMe = useCallback(async () => {
    setMe(await fetchMe());
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const handleLogout = useCallback(async () => {
    await apiLogout();
    await refreshMe();
  }, [refreshMe]);

  return (
    <main>
      <h1>Patterns of Play</h1>
      {me === null && <p>Loading...</p>}
      {me !== null && me.user === null && <AuthForms onAuthenticated={refreshMe} />}
      {me !== null && me.user !== null && me.memberships.length === 0 && (
        <TeamOnboarding role={me.user.role} onTeamReady={refreshMe} />
      )}
      {me !== null && me.user !== null && me.memberships.length > 0 && (
        <TeamDashboard user={me.user} memberships={me.memberships} onLogout={handleLogout} />
      )}
    </main>
  );
}
