import Foundation

/// On-device cache for strain images. We push the shared `URLSession`
/// cache up to a generous disk-backed size so the Home rail posters
/// and the strain detail page hero render instantly on repeat visits
/// — no Firebase round-trip, no Leafly round-trip — and across app
/// launches.
///
/// Why a shared `URLCache` (and not a hand-rolled disk cache):
/// - iOS already gives us memory + disk caching for `URLSession` /
///   `AsyncImage` for free; we just need to give it more room.
/// - HTTP `Cache-Control` from Leafly / Firebase Storage is honored
///   automatically — when the upstream image is fresh we get a 304,
///   when it's stale we get a conditional revalidation.
/// - The cache survives app relaunches because URLCache persists
///   to the disk path under `Library/Caches/`.
enum StrainImageCache {
    /// 32 MB memory + 256 MB disk. Generous for a catalog of strain
    /// posters (most are 50–200 KB each) so the entire Home rail
    /// fits in disk and the visible subset sits in memory.
    static let memoryCost = 32 * 1024 * 1024
    static let diskCost = 256 * 1024 * 1024

    /// Apply the cache to the shared `URLSession`. Idempotent — safe
    /// to call from `App.init` and from any later warm-up hook.
    static func configure() {
        let cache = URLCache(
            memoryCapacity: memoryCost,
            diskCapacity: diskCost,
            diskPath: "strain-image-cache"
        )
        URLCache.shared = cache
    }

    /// Wipe the on-device image cache. Useful for tests and for a
    /// future "reset" affordance; not wired into the UI today.
    static func clear() {
        URLCache.shared.removeAllCachedResponses()
    }
}
