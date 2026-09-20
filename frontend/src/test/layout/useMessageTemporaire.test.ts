import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMessageTemporaire } from "../../layout/useMessageTemporaire";

describe("useMessageTemporaire", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("disparaît seul après la durée prévue", () => {
    const { result } = renderHook(() => useMessageTemporaire(1000));
    act(() => result.current.afficher("Enregistré."));
    expect(result.current.message).toBe("Enregistré.");
    act(() => vi.advanceTimersByTime(999));
    expect(result.current.message).toBe("Enregistré.");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.message).toBeNull();
  });

  it("relance le minuteur quand le même texte est réaffiché", () => {
    const { result } = renderHook(() => useMessageTemporaire(1000));
    act(() => result.current.afficher("Enregistré."));
    act(() => vi.advanceTimersByTime(800));
    act(() => result.current.afficher("Enregistré."));
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.message).toBe("Enregistré.");
  });

  it("peut être fermé manuellement", () => {
    const { result } = renderHook(() => useMessageTemporaire());
    act(() => result.current.afficher("Enregistré."));
    act(() => result.current.fermer());
    expect(result.current.message).toBeNull();
  });
});
