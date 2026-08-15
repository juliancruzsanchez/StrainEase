import SwiftUI

/// StrainEase color tokens — converted from the web `oklch` theme in `src/index.css`.
enum Palette {
    static let background = Color(light: rgb(0.967, 0.981, 0.971), dark: rgb(0.043, 0.067, 0.053))
    static let foreground = Color(light: rgb(0.099, 0.144, 0.119), dark: rgb(0.906, 0.929, 0.914))
    static let card = Color(light: .white, dark: rgb(0.074, 0.103, 0.087))
    static let primary = Color(light: rgb(0.006, 0.375, 0.227), dark: rgb(0.444, 0.746, 0.575))
    static let primaryForeground = Color(light: rgb(0.978, 0.991, 0.980), dark: rgb(0.023, 0.062, 0.040))
    static let muted = Color(light: rgb(0.917, 0.952, 0.929), dark: rgb(0.121, 0.162, 0.139))
    static let mutedForeground = Color(light: rgb(0.343, 0.407, 0.370), dark: rgb(0.559, 0.613, 0.579))
    static let accent = Color(light: rgb(0.867, 0.954, 0.899), dark: rgb(0.119, 0.201, 0.153))
    static let border = Color(light: rgb(0.856, 0.885, 0.868), dark: Color.white.opacity(0.10))
    static let ring = Color(light: rgb(0.303, 0.567, 0.421), dark: rgb(0.303, 0.567, 0.421))
    static let destructive = Color(light: rgb(0.78, 0.22, 0.18), dark: rgb(0.90, 0.40, 0.32))

    static let indica = Color(light: rgb(0.72, 0.48, 0.16), dark: rgb(0.92, 0.72, 0.38))
    static let sativa = Color(light: rgb(0.18, 0.46, 0.68), dark: rgb(0.48, 0.74, 0.92))
    static let hybrid = Color(light: rgb(0.006, 0.375, 0.227), dark: rgb(0.444, 0.746, 0.575))

    static let glowMint = Color(light: rgb(0.55, 0.82, 0.66).opacity(0.42), dark: rgb(0.28, 0.62, 0.44).opacity(0.28))
    static let glowDeep = Color(light: rgb(0.10, 0.36, 0.24).opacity(0.14), dark: rgb(0.10, 0.55, 0.32).opacity(0.22))

    private static func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color {
        Color(red: r, green: g, blue: b)
    }
}

extension Color {
    init(light: Color, dark: Color) {
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(dark)
                : UIColor(light)
        })
    }
}

enum TypeStyle {
    static func color(for type: StrainType?) -> Color {
        switch type {
        case .indica: Palette.indica
        case .sativa: Palette.sativa
        default: Palette.hybrid
        }
    }

    static func label(for type: StrainType?) -> String {
        switch type {
        case .indica: "Indica"
        case .sativa: "Sativa"
        case .hybrid: "Hybrid"
        case nil: "Strain"
        }
    }
}
