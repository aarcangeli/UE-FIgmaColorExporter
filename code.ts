function convertToHex(color: RGB) {
    function pad(num: number) {
        let s = num.toString(16);
        while (s.length < 2) s = "0" + s;
        return s;
    }

    let red = Math.round(color.r * 255);
    let green = Math.round(color.g * 255);
    let blue = Math.round(color.b * 255);
    return `0x${pad(red)}${pad(green)}${pad(blue)}`;
}

type NamedColor = {
    // Full name (e.g. "GreyScale/Black")
    name: string;

    // Full name escaped for C++ string
    stringName: string;

    // Full name for C++ enum (e.g. "GreyScaleBlack")
    enumName: string;

    // Color value
    color: RGB;

    // Alpha value
    alpha?: number;
}

function escapeEnumName(name: string) {
    // Remove accents
    name = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    return name.replace(/[^a-zA-Z0-9_]/g, "");
}

function makeLinearColor(color: RGB, alpha?: number) {
    const fixed = (x: number) => Math.trunc(x * 255);
    if (alpha !== undefined && alpha !== 1) {
        return `_makeColor(${convertToHex(color)}, ${Math.trunc(alpha * 255)})`;
    } else {
        return `_makeColor(${convertToHex(color)})`;
    }
}

function makeTemplate(colors: NamedColor[]) {
    return `
#pragma once

#include "CoreMinimal.h"
#include "DsColorStyle.generated.h"

UENUM(BlueprintType)
enum class EDsColorStyle : uint8 {
${colors.map(color => `    ${color.enumName} UMETA(DisplayName = "${color.stringName}"),`).join('\n')}

    Max UMETA(DisplayName = "Max")
};

UCLASS()
class UColorStyleMap : public UBlueprintFunctionLibrary {
    GENERATED_BODY()
public:
    /**
     * Get the color associated with the given style.
     */
    UFUNCTION(BlueprintPure, Category = "Lsm|DesignSystem")
    static FColor GetPaletteColor(EDsColorStyle ColorStyle) {
        check(ColorStyle != EDsColorStyle::Max);
        return _colors[static_cast<uint8>(ColorStyle)];
    }

private:
    /**
     * Convert a hex color to a linear color.
     * Eg: _makeColor(0xff0000) -> FColor(1, 0, 0)
     */
    static constexpr FColor _makeColor(const uint32 hex, const uint8 alpha = 255) {
        const uint8 red = (hex >> 16) & 0xFF;
        const uint8 green = (hex >> 8) & 0xFF;
        const uint8 blue = hex & 0xFF;
        return FColor(red, green, blue, alpha);
    }

    /**
     * The list of colors by id;
     */
    static inline TArray<FColor, TInlineAllocator<static_cast<uint8>(EDsColorStyle::Max)>> _colors = {
${colors.map(color => `        ${makeLinearColor(color.color, color.alpha)}, // ${color.name}`).join('\n')}
    };
};
`.trim() + "\n";
}

function exportColors() {
    const colors: NamedColor[] = [];
    for (let style of figma.getLocalPaintStyles()) {
        for (let paint of style.paints) {
            // Get only solid colors
            if (paint.type != "SOLID") {
                continue;
            }

            // Ignore Avatar colors
            // TODO: this should be less hacky
            if (style.name.startsWith("Avatar user square/")) {
                continue;
            }

            colors.push({
                name: style.name,
                stringName: style.name.replace("\"", "\\\""),
                enumName: escapeEnumName(style.name),
                color: paint.color,
                alpha: paint.opacity,
            });
        }
    }
    return makeTemplate(colors);
}

const template = exportColors();
console.log(template);
figma.showUI(__html__, {width: 200, height: 50});
figma.ui.postMessage({copyToClipboard: template});

figma.ui.onmessage = (message) => {
    figma.closePlugin("Code copied to clipboard");
}
