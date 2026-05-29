import { useState, useEffect, useCallback } from 'react';
import { getClientUuid } from '../services/chatSocket';
import { getPreferences, savePreferences } from '../services/api';

export function usePreferences() {
  const clientUuid = getClientUuid();
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getPreferences(clientUuid)
      .then((data) => { if (active) setPrefs(data.preferences || {}); })
      .catch(() => { if (active) setPrefs({}); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clientUuid]);

  const save = useCallback(async (next) => {
    setPrefs(next);
    const data = await savePreferences(clientUuid, next);
    return data.preferences;
  }, [clientUuid]);

  return { prefs, setPrefs, save, loading };
}
