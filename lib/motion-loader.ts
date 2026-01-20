import { MotionClip } from "@/types/motion";

// Cache loaded motion clips
const motionCache = new Map<string, MotionClip>();

/**
 * Load a motion JSON file by gloss name
 * @param gloss - The gloss name (e.g., "ABOUT", "HELLO")
 * @returns Promise<MotionClip | null>
 */
export async function loadMotion(gloss: string): Promise<MotionClip | null> {
    // Check cache first
    if (motionCache.has(gloss)) {
        console.log(`📦 Using cached motion for gloss: ${gloss}`);
        return motionCache.get(gloss)!;
    }

    try {
        // Normalize gloss to uppercase
        const normalizedGloss = gloss.toUpperCase();
        const response = await fetch(`/models/motion_library/${normalizedGloss}.json`);

        if (!response.ok) {
            console.warn(`⚠️ Motion file not found for gloss: ${gloss}`);
            return null;
        }

        const motionData: MotionClip = await response.json();

        // Validate the motion data
        if (!motionData.frames || motionData.frames.length === 0) {
            console.error(`❌ Invalid motion data for gloss: ${gloss}`);
            return null;
        }

        // Cache the loaded motion
        motionCache.set(gloss, motionData);

        console.log(`✅ Loaded motion for gloss: ${gloss} (${motionData.frames.length} frames, ${motionData.duration.toFixed(2)}s)`);
        return motionData;

    } catch (error) {
        console.error(`❌ Failed to load motion for gloss: ${gloss}`, error);
        return null;
    }
}

/**
 * Preload multiple motion clips
 * @param glosses - Array of gloss names to preload
 */
export async function preloadMotions(glosses: string[]): Promise<void> {
    console.log(`📚 Preloading ${glosses.length} motion clips...`);

    const loadPromises = glosses.map(gloss => loadMotion(gloss));
    await Promise.allSettled(loadPromises);

    console.log(`✅ Preloaded ${motionCache.size} motion clips`);
}

/**
 * Clear the motion cache
 */
export function clearMotionCache(): void {
    motionCache.clear();
    console.log("🗑️ Motion cache cleared");
}

/**
 * Get all cached motion glosses
 */
export function getCachedGlosses(): string[] {
    return Array.from(motionCache.keys());
}
