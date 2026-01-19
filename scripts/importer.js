const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MTGImporter extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        tag: "form",
        id: "mtg-importer",
        window: {
            title: "Import MTG Set",
            resizable: false
        },
        position: {
            width: 400,
            height: "auto"
        },
        actions: {
            importSet: MTGImporter.prototype.processImport
        }
    };

    static PARTS = {
        form: {
            template: "systems/foundry-mtg/templates/importer.html"
        }
    };

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        // Fetch sets from Scryfall
        let sets = [];
        try {
            const response = await fetch("https://api.scryfall.com/sets");
            const json = await response.json();
            sets = json.data
                .filter(s => s.card_count > 0)
                .sort((a, b) => a.released_at < b.released_at ? 1 : -1);
        } catch (e) {
            console.error(e);
            ui.notifications.error("Failed to fetch sets from Scryfall.");
        }

        return { sets };
    }

    /* -------------------------------------------- */

    async processImport(event, target) {
        // V2: target is the button
        const form = target.closest("form");
        const setCode = form["set-code"].value;

        const btn = form.querySelector("[data-action='importSet']");
        btn.disabled = true;
        btn.innerText = "Importing...";

        if (!setCode) {
            ui.notifications.warn("Please select a set.");
            btn.disabled = false;
            btn.innerText = "Import Set";
            return;
        }

        ui.notifications.info(`Starting import for set: ${setCode}...`);
        // this.close(); // Keep open

        // Logic: Fetch -> Create
        // Re-use logic from before, just strictly async

        // 1. Fetch Cards
        let cards = [];
        let url = `https://api.scryfall.com/cards/search?q=set:${setCode}+unique:prints`;
        let hasMore = true;

        try {
            while (hasMore) {
                const res = await fetch(url);
                const json = await res.json();
                cards = cards.concat(json.data);
                hasMore = json.has_more;
                url = json.next_page;
                await new Promise(r => setTimeout(r, 100));
            }
        } catch (e) {
            console.error(e);
            btn.disabled = false;
            btn.innerText = "Import Set";
            return ui.notifications.error("Failed to download set data.");
        }

        ui.notifications.info(`Fetched ${cards.length} cards. Preparing to create Items...`);

        // 2. Prepare Compendium
        const compendiumName = `mtg-cards-${setCode}`;
        let pack = game.packs.get(`world.${compendiumName}`);
        if (!pack) {
            pack = await CompendiumCollection.createCompendium({
                type: "Item",
                label: `MTG: ${setCode.toUpperCase()}`,
                name: compendiumName,
                package: "world"
            });
        }

        // 3. Folder & Progress
        const targetFolder = `systems/foundry-mtg/assets/cards/${setCode}`;

        // Suppress warnings for system path writing
        const suppressWarnings = (fn) => {
            const orig = ui.notifications.warn;
            ui.notifications.warn = (msg, opts) => {
                // Filter out the specific system path warning if possible, or just all
                // "You are saving a file to a System directory"
                if (typeof msg === "string" && (msg.includes("System directory") || msg.includes("save"))) return;
                orig.call(ui.notifications, msg, opts);
            };
            try {
                return fn();
            } finally {
                ui.notifications.warn = orig;
            }
        };

        // Recursive folder creation
        try {
            await suppressWarnings(async () => {
                await this.ensurePath("systems/foundry-mtg/assets");
                await this.ensurePath("systems/foundry-mtg/assets/cards");
                await this.ensurePath(targetFolder);
            });
        } catch (e) {
            console.error("Failed to create folders", e);
            btn.disabled = false;
            btn.innerText = "Import Set";
            return ui.notifications.error("Could not create image directories. Check console.");
        }

        let processed = 0;
        const batchSize = 5;

        SceneNavigation.displayProgressBar({ label: `Importing ${setCode.toUpperCase()}`, pct: 0 });

        for (let i = 0; i < cards.length; i += batchSize) {
            const chunk = cards.slice(i, i + batchSize);
            // Pass safeUpload to createCardItem or redefine it there.
            // Easiest is to modify createCardItem to use suppression or pass a flag.
            // Let's modify createCardItem inside this class to just do it locally?
            // Or bind it?
            // Actually, createCardItem calls `FilePicker.upload`. I'll monkey patch it there too?
            // Better: Update createCardItem to handle it.

            await Promise.all(chunk.map(c => this.createCardItem(c, pack, targetFolder, true)));

            processed += chunk.length;
            SceneNavigation.displayProgressBar({ label: `Importing ${setCode.toUpperCase()}`, pct: Math.round((processed / cards.length) * 100) });
        }

        SceneNavigation.displayProgressBar({ label: "Complete", pct: 100 });
        ui.notifications.info(`Import complete! Created/Updated ${processed} cards in compendium: ${compendiumName}`);
        this.close();
    }

    async ensurePath(path) {
        try {
            await FilePicker.createDirectory("data", path);
        } catch (err) {
            if (!err.message.includes("EEXIST") && !err.message.includes("already exists")) {
                // ignore
            }
        }
    }

    /* -------------------------------------------- */

    async createCardItem(cardData, pack, targetFolder, suppress = false) {
        let imgPath = "icons/svg/card-hand.svg";
        let imageUrl = cardData.image_uris?.large || cardData.card_faces?.[0]?.image_uris?.large;

        if (imageUrl) {
            const fileName = `${cardData.id}.jpg`;
            try {
                const res = await fetch(imageUrl);
                const blob = await res.blob();
                const file = new File([blob], fileName, { type: blob.type });

                if (suppress) {
                    const origWarn = ui.notifications.warn;
                    const origInfo = ui.notifications.info;
                    ui.notifications.warn = () => { };
                    ui.notifications.info = () => { };
                    try {
                        await FilePicker.upload("data", targetFolder, file);
                    } finally {
                        ui.notifications.warn = origWarn;
                        ui.notifications.info = origInfo;
                    }
                } else {
                    await FilePicker.upload("data", targetFolder, file);
                }

                imgPath = `${targetFolder}/${fileName}`;
            } catch (e) {
                imgPath = imageUrl;
            }
        }

        const itemData = {
            name: cardData.name,
            type: "card",
            img: imgPath,
            system: {
                type_line: cardData.type_line,
                mana_cost: cardData.mana_cost,
                oracle_id: cardData.oracle_id,
                rarity: cardData.rarity,
                set: cardData.set,
                description: (cardData.oracle_text || "").replace(/\n/g, "<br>"),
                color_identity: cardData.color_identity,
                props: cardData
            }
        };

        await Item.create(itemData, { pack: pack.collection });
    }
}
