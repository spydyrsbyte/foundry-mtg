const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
import { PackOpener } from "../pack-opener.js";

export class MTGPackSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["foundry-mtg", "sheet", "item", "pack"],
        window: {
            title: "MTG Pack Opener",
            icon: "fas fa-box-open",
            resizable: false,
            controls: []
        },
        position: {
            width: 400,
            height: 350
        },
        actions: {
            openPack: MTGPackSheet._onOpenPack
        }
    };

    static PARTS = {
        sheet: {
            template: "systems/foundry-mtg/templates/sheets/pack-sheet.html"
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const item = this.document;

        context.system = item.system;
        context.flags = item.flags;

        // Populate available sets from Compendiums
        context.availableSets = game.packs
            .filter(p => p.metadata.name.includes("mtg-cards-"))
            .map(p => {
                const code = p.metadata.name.replace("mtg-cards-", "");
                return {
                    code: code,
                    label: `${p.metadata.label} (${code.toUpperCase()})`
                };
            });

        // Determine if we can open
        context.canOpen = !!context.system.set_code;

        return context;
    }

    static async _onOpenPack(event, target) {
        const app = this;
        const item = app.document;

        if (!item.system.set_code) {
            console.warn("No set code defined");
            return;
        }

        // Close sheet?
        app.close();

        // Delegate to PackOpener (which deletes the item after success)
        await PackOpener.open(item);
    }
}
