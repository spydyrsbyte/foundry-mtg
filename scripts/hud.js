import { MTGJoinTable } from "./apps/join-table.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MTGHUD extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "mtg-hud",
        tag: "div",
        window: {
            frame: false, // Frameless window (no header/border)
            positioned: true,
            title: "MTG HUD",
            resizable: false,
            minimizable: false,
            controls: []
        },
        position: {
            width: "100%", // Full screen
            height: "100%",
            top: 0,
            left: 0
        }
    };

    static PARTS = {
        hud: {
            template: "systems/foundry-mtg/templates/hud/hud.html",
        }
    };

    async _prepareContext(options) {
        // Find the user's Planeswalker Token
        const token = this._findMyToken();
        const actor = token?.actor;

        const context = {
            isGM: game.user.isGM,
            hasToken: !!token,
            planeswalker: actor ? {
                name: actor.name,
                life: actor.system.life?.value ?? 20,
                color: actor.system.color ?? "#ffffff"
            } : null
        };

        return context;
    }

    _findMyToken() {
        if (!canvas.ready) return null;
        // Find a token owned by the user that is a "planeswalker"
        const tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.isOwner && t.actor.type === "planeswalker");
        if (tokens.length === 0) return null;

        // If multiple, maybe pick the selected one? Or just the first one.
        // For now, return the first one found.
        return tokens[0];
    }

    _onRender(context, options) {
        // Bind listeners
        const html = this.element;

        html.querySelector(".join-table-btn")?.addEventListener("click", () => {
            new MTGJoinTable().render(true);
        });
    }

    // Static Hook Registration
    static initHooks() {
        Hooks.on("canvasReady", () => {
            // Re-render when changing scenes
            const hud = Object.values(ui.windows).find(w => w instanceof MTGHUD) || new MTGHUD();
            hud.render({ force: true });
        });

        Hooks.on("createToken", (tokenDoc) => {
            // Re-render if new token appears and it might be ours
            if (tokenDoc.actor?.type === "planeswalker" && tokenDoc.actor?.testUserPermission(game.user, "OWNER")) {
                const hud = Object.values(ui.windows).find(w => w instanceof MTGHUD);
                hud?.render();
            }
        });

        Hooks.on("deleteToken", (tokenDoc) => {
            // Re-render if our token disappears
            if (tokenDoc.actor?.type === "planeswalker" && tokenDoc.actor?.testUserPermission(game.user, "OWNER")) {
                const hud = Object.values(ui.windows).find(w => w instanceof MTGHUD);
                hud?.render();
            }
        });

        Hooks.on("updateActor", (actor, changes) => {
            // Re-render if our life changes
            if (actor.type === "planeswalker" && actor.isOwner && (changes.system || changes.name)) {
                const hud = Object.values(ui.windows).find(w => w instanceof MTGHUD);
                hud?.render();
            }
        });
    }
}
