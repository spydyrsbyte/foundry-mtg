export class BattlefieldHandler {
    static init() {
        Hooks.on("dropCanvasData", this._onDropCanvasData.bind(this));
        Hooks.on("deleteToken", this._onDeleteToken.bind(this));
    }

    /**
     * Handle dropping a Card Item onto the canvas.
     */
    static async _onDropCanvasData(canvas, data) {
        if (data.type !== "Item") return;
        const item = await Item.implementation.fromDropData(data);
        if (!item || item.type !== "card") return;

        // Check ownership
        if (item.system.owner !== game.user.id && !game.user.isGM) {
            return ui.notifications.warn("You do not own this card.");
        }

        // Check if already on battlefield (prevent duplicates if dragging same item again?)
        // Actually, if it's already there, maybe we just want to move it?
        // But Foundry handles Token movement natively. dragging the CARD Item implies playing it.
        if (item.system.location === "battlefield") {
            // Maybe alert user? Or allow re-instantiating (creating a token copy)?
            // For now, let's allow it but warn.
            // ui.notifications.warn("This card is already on the battlefield.");
        }

        // 1. Get or Create Base Permanent Actor
        let baseActor = game.actors.find(a => a.name === "Base Permanent" && a.type === "permanent");
        if (!baseActor) {
            baseActor = await Actor.create({
                name: "Base Permanent",
                type: "permanent",
                img: "icons/svg/item-bag.svg"
            });
        }

        // 2. Prepare Token Data
        // We create an unlinked token that mimics the card
        const tokenData = {
            name: item.name,
            img: item.img, // Texture
            x: data.x, // Canvas Drop X
            y: data.y, // Canvas Drop Y
            actorId: baseActor.id,
            actorLink: false, // Unlinked!
            texture: { src: item.img },
            appendNumber: true, // In case of multiples
        };

        // 3. Create Token
        const [tokenDoc] = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);

        // 4. Update the Synthetic Actor of this Token with specific Card Data
        // We need to store the card_id so we know which card this token represents.
        if (tokenDoc) {
            await tokenDoc.actor.update({
                "name": item.name,
                "img": item.img,
                "system.card_id": item.id,
                "system.power": item.system.power || 0,
                "system.toughness": item.system.toughness || 0,
                "system.tapped": false
            });
        }

        // 5. Update the Original Card Item
        // Mark it as on the battlefield (so it disappears from Hand)
        await item.update({ "system.location": "battlefield" });
    }

    /**
     * Handle deleting a token -> Move card to graveyard.
     */
    static async _onDeleteToken(tokenDoc, options, userId) {
        // Only run if we are the user interacting or the owner
        // if (game.user.id !== userId) return; // Hook fires for all clients, wait.
        // We generally rely on the client who triggered the delete to do the update.

        const actor = tokenDoc.actor;
        if (!actor || actor.type !== "permanent") return; // Not a MTG permanent

        const cardId = actor.system.card_id;
        if (!cardId) return; // Just a generic token

        // Find the Table Actor
        const table = game.actors.find(a => a.type === "table");
        if (!table) return;

        const card = table.items.get(cardId);
        if (card) {
            // Check if we should move to graveyard
            if (card.system.location === "battlefield") {
                await card.update({ "system.location": "graveyard" });
                // Notify?
            }
        }
    }
}
