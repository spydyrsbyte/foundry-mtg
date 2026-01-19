export class ThemeConfig extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "theme-config",
            title: "Theme Configuration",
            template: "systems/foundry-mtg/templates/apps/theme-config.html",
            width: 400,
            classes: ["foundry-mtg", "theme-config"]
        });
    }

    getData() {
        return {
            color1: game.settings.get("foundry-mtg", "theme.color1"),
            color2: game.settings.get("foundry-mtg", "theme.color2"),
            color3: game.settings.get("foundry-mtg", "theme.color3"),
            useGradient: game.settings.get("foundry-mtg", "theme.useGradient"),
            backgroundImage: game.settings.get("foundry-mtg", "theme.backgroundImage")
        };
    }

    async _updateObject(event, formData) {
        for (let [key, value] of Object.entries(formData)) {
            await game.settings.set("foundry-mtg", `theme.${key}`, value);
        }
    }
}

export function registerSettings() {
    game.settings.registerMenu("foundry-mtg", "themeConfig", {
        name: "Theme Configuration",
        label: "Customize Theme",
        hint: "Adjust colors and background for your local view.",
        icon: "fas fa-palette",
        type: ThemeConfig,
        restricted: false // Client side, so anyone can do it
    });

    const settings = [
        { key: "color1", type: String, default: "#1a1a1a" },
        { key: "color2", type: String, default: "#2c2c2c" },
        { key: "color3", type: String, default: "#ff9900" }, // Accent
        { key: "useGradient", type: Boolean, default: true },
        { key: "backgroundImage", type: String, default: "systems/foundry-mtg/assets/cards/default/back.webp" } // Just a placeholder
    ];

    for (let s of settings) {
        game.settings.register("foundry-mtg", `theme.${s.key}`, {
            scope: "client",
            config: false,
            type: s.type,
            default: s.default,
            onChange: () => applyTheme()
        });
    }
}

export function applyTheme() {
    const root = document.documentElement;
    const color1 = game.settings.get("foundry-mtg", "theme.color1");
    const color2 = game.settings.get("foundry-mtg", "theme.color2");
    const color3 = game.settings.get("foundry-mtg", "theme.color3");
    const useGradient = game.settings.get("foundry-mtg", "theme.useGradient");
    let bgImage = game.settings.get("foundry-mtg", "theme.backgroundImage");
    const normalizedBgImage = bgImage.startsWith('http://') || bgImage.startsWith('https://') ? bgImage : `/${bgImage.replace(/^\/+/, '')}`;
    root.style.setProperty("--mtg-color-1", color1);
    root.style.setProperty("--mtg-color-2", color2);
    root.style.setProperty("--mtg-color-3", color3);

    // Construct Background
    let bgValue = "";
    if (useGradient) {
        bgValue = `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`;
    } else {
        bgValue = color1;
    }

    if (bgImage) {
        // Overlay the image? Or replace? 
        // Typically a nice theme has a subtle texture or image with gradient overlay.
        // Let's do: linear-gradient(...), url(...)
        bgValue = `${bgValue}, url('${normalizedBgImage}')`;
    }

    root.style.setProperty("--mtg-bg-complex", bgValue);
    root.style.setProperty("--mtg-bg-image", `url('${normalizedBgImage}')`);
}
