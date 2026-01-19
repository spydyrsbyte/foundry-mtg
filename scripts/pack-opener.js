import { MTGPackResults } from "./apps/pack-results.js";

export class PackOpener {

    /**
     * Opens a pack item and generates cards for the actor.
     * @param {Item} packItem - The pack item being opened.
     */
    static async open(packItem) {
        const actor = packItem.actor;
        if (!actor) return ui.notifications.warn("You can only open packs that belong to an Actor.");

        const setCode = packItem.system.set_code || "war"; // Default or fallback?
        const compendiumName = `world.mtg-cards-${setCode}`;
        const pack = game.packs.get(compendiumName);

        if (!pack) {
            return ui.notifications.error(`Could not find Compendium for set '${setCode}' (${compendiumName})`);
        }

        // Get index fields to filter by rarity and legality
        const index = await pack.getIndex({ fields: ["system.rarity", "system.props.legalities"] });

        // Filter helper: Must be legal in Commander
        const isLegal = (i) => {
            // "props" is the scryfall dump.
            // If the field is missing (e.g. old import), we might need to be careful.
            const commander = i.system?.props?.legalities?.commander;
            return commander === "legal";
        };

        const commons = index.filter(i => i.system?.rarity === "common" && isLegal(i));
        const uncommons = index.filter(i => i.system?.rarity === "uncommon" && isLegal(i));
        const rares = index.filter(i => (i.system?.rarity === "rare" || i.system?.rarity === "mythic") && isLegal(i));

        if (commons.length < 10 || uncommons.length < 3 || rares.length < 1) {
            return ui.notifications.warn(`Not enough COMMANDER LEGAL cards in compendium ${setCode} to generate a booster.`);
        }

        // Logic: 1 Rare, 3 Uncommon, 10 Common
        // Simplification: Uniform distribution, no foil logic yet
        const selectedIds = [];

        // 1 Rare/Mythic
        selectedIds.push(this._randomSample(rares)._id);

        // 3 Uncommon
        for (let i = 0; i < 3; i++) selectedIds.push(this._randomSample(uncommons)._id);

        // 10 Common
        for (let i = 0; i < 10; i++) selectedIds.push(this._randomSample(commons)._id);

        // Fetch full data for these IDs
        const createdItemsData = [];
        for (let id of selectedIds) {
            const ent = await pack.getDocument(id);
            const data = ent.toObject();
            delete data._id; // New ID

            // Provenance Tracking
            data.system.pack = {
                owner: actor.id,
                opened: Date.now(),
                trades: []
            };

            createdItemsData.push(data);
        }

        // Create in Actor
        const createdItems = await actor.createEmbeddedDocuments("Item", createdItemsData);

        // Show Results Screen
        new MTGPackResults(createdItems).render(true);

        // Chat Message
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<h3>Opened ${packItem.name}</h3><p>Added ${createdItemsData.length} cards to collection.</p>`
        });

        // Delete Pack
        await packItem.delete();
    }

    static _randomSample(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}
