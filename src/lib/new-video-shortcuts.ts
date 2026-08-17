export type NewVideoAction = "stop" | "later" | "seen" | "like";

const ACTION_KEYS: Record<string, NewVideoAction> = {
    x: "stop",
    c: "later",
    v: "seen",
    b: "like",
};

export function getNewVideoActionForKey(key: string): NewVideoAction | null {
    return ACTION_KEYS[key.toLocaleLowerCase()] ?? null;
}

export function isMatchingActionRelease(
    pressedAction: NewVideoAction | null,
    releasedKey: string
): boolean {
    return pressedAction != null && getNewVideoActionForKey(releasedKey) === pressedAction;
}

export function shouldCancelPressedAction(
    pressedAction: NewVideoAction | null,
    pressedKey: string
): boolean {
    return pressedAction != null && getNewVideoActionForKey(pressedKey) !== pressedAction;
}
