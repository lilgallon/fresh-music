import { describe, expect, it } from "vitest";
import {
    getNewVideoActionForKey,
    isMatchingActionRelease,
    shouldCancelPressedAction,
} from "./new-video-shortcuts";

describe("New video shortcuts", () => {
    it("uses the exact X, C, V, B action order", () => {
        expect(getNewVideoActionForKey("x")).toBe("stop");
        expect(getNewVideoActionForKey("C")).toBe("later");
        expect(getNewVideoActionForKey("v")).toBe("seen");
        expect(getNewVideoActionForKey("B")).toBe("like");
    });

    it("never maps YouTube arrow controls", () => {
        expect(getNewVideoActionForKey("ArrowLeft")).toBeNull();
        expect(getNewVideoActionForKey("ArrowRight")).toBeNull();
        expect(getNewVideoActionForKey("ArrowUp")).toBeNull();
        expect(getNewVideoActionForKey("ArrowDown")).toBeNull();
    });

    it("executes only when the released key matches the pressed action", () => {
        expect(isMatchingActionRelease("seen", "v")).toBe(true);
        expect(isMatchingActionRelease("seen", "b")).toBe(false);
        expect(isMatchingActionRelease(null, "v")).toBe(false);
    });

    it("cancels a pending shortcut as soon as another key is pressed", () => {
        expect(shouldCancelPressedAction("seen", "b")).toBe(true);
        expect(shouldCancelPressedAction("seen", "Meta")).toBe(true);
        expect(shouldCancelPressedAction("seen", "v")).toBe(false);
        expect(shouldCancelPressedAction(null, "b")).toBe(false);
    });
});
