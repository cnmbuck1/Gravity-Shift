import Foundation
import Capacitor
import GameKit

/// Game Center for the web game (src/gamecenter/GameCenter.ts): sign-in, scores, ranks,
/// achievements and Apple's leaderboard screens. Registered in ViewController.swift.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadRank", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportAchievements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showDashboard", returnType: CAPPluginReturnPromise)
    ]

    /// Calls waiting for the first answer from Game Center's sign-in.
    private var pendingAuth: [CAPPluginCall] = []
    private var authStarted = false
    /** Game Center has answered the sign-in at least once. */
    private var authAnswered = false

    private func playerInfo(_ error: Error? = nil) -> [String: Any] {
        let player = GKLocalPlayer.local
        var info: [String: Any] = ["authenticated": player.isAuthenticated]
        if player.isAuthenticated { info["name"] = player.displayName }
        if let error = error { info["error"] = error.localizedDescription }
        return info
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if GKLocalPlayer.local.isAuthenticated {
                call.resolve(self.playerInfo())
                return
            }
            // Game Center calls the handler once per sign-in change, so it is set only once. After the
            // first answer, a player who isn't signed in gets that answer straight away: the handler
            // won't run again until they sign in from the Settings app, and waiting would hang the call.
            if self.authStarted && self.pendingAuth.isEmpty && self.authAnswered {
                call.resolve(self.playerInfo())
                return
            }
            self.pendingAuth.append(call)
            if self.authStarted { return }
            self.authStarted = true
            GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, error in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    if let viewController = viewController {
                        // Game Center's own sign-in sheet; the handler runs again when it closes.
                        self.bridge?.viewController?.present(viewController, animated: true)
                        return
                    }
                    self.authAnswered = true
                    let info = self.playerInfo(error)
                    let waiting = self.pendingAuth
                    self.pendingAuth = []
                    for c in waiting { c.resolve(info) }
                    self.notifyListeners("authChanged", data: info)
                }
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { return call.reject("Not signed in to Game Center") }
        guard let ids = call.getArray("leaderboardIDs", String.self), !ids.isEmpty,
              let score = call.getInt("score") else { return call.reject("leaderboardIDs and score are required") }
        let context = call.getInt("context") ?? 0
        GKLeaderboard.submitScore(score, context: context, player: GKLocalPlayer.local, leaderboardIDs: ids) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    private func entryInfo(_ e: GKLeaderboard.Entry) -> [String: Any] {
        return ["name": e.player.displayName, "score": e.score, "rank": e.rank]
    }

    /// The player's global rank, the player just above them, and the closest friends above them.
    @objc func loadRank(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { return call.reject("Not signed in to Game Center") }
        guard let id = call.getString("leaderboardID") else { return call.reject("leaderboardID is required") }
        GKLeaderboard.loadLeaderboards(IDs: [id]) { boards, error in
            guard let board = boards?.first else {
                return call.reject(error?.localizedDescription ?? "No leaderboard \(id)")
            }
            board.loadEntries(for: .global, timeScope: .allTime, range: NSRange(location: 1, length: 1)) { local, _, total, error in
                if let error = error { return call.reject(error.localizedDescription) }
                var result: [String: Any] = ["total": total, "friendsAhead": [[String: Any]]()]
                guard let local = local else { return call.resolve(result) }
                result["rank"] = local.rank
                result["score"] = local.score
                let me = GKLocalPlayer.local.gamePlayerID
                let finish = {
                    board.loadEntries(for: .friendsOnly, timeScope: .allTime, range: NSRange(location: 1, length: 100)) { _, friends, _, _ in
                        let ahead = (friends ?? [])
                            .filter { $0.rank < local.rank && $0.player.gamePlayerID != me }
                            .sorted { $0.rank > $1.rank }
                            .prefix(2)
                        result["friendsAhead"] = ahead.map { self.entryInfo($0) }
                        call.resolve(result)
                    }
                }
                if local.rank <= 1 { return finish() }
                board.loadEntries(for: .global, timeScope: .allTime, range: NSRange(location: local.rank - 1, length: 1)) { _, above, _, _ in
                    if let next = above?.first(where: { $0.player.gamePlayerID != me }) { result["ahead"] = self.entryInfo(next) }
                    finish()
                }
            }
        }
    }

    @objc func reportAchievements(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else { return call.reject("Not signed in to Game Center") }
        let list = call.getArray("achievements", JSObject.self) ?? []
        let achievements: [GKAchievement] = list.compactMap { item in
            guard let id = item["id"] as? String, let percent = item["percent"] as? NSNumber else { return nil }
            let a = GKAchievement(identifier: id)
            a.percentComplete = min(100, max(0, percent.doubleValue))
            // The game shows its own neon badge for a new achievement.
            a.showsCompletionBanner = false
            return a
        }
        if achievements.isEmpty { return call.resolve() }
        GKAchievement.report(achievements) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func showDashboard(_ call: CAPPluginCall) {
        let id = call.getString("leaderboardID")
        let state = call.getString("state")
        DispatchQueue.main.async {
            let vc: GKGameCenterViewController
            if let id = id {
                vc = GKGameCenterViewController(leaderboardID: id, playerScope: .global, timeScope: .allTime)
            } else if state == "achievements" {
                vc = GKGameCenterViewController(state: .achievements)
            } else {
                vc = GKGameCenterViewController(state: .leaderboards)
            }
            vc.gameCenterDelegate = self
            self.bridge?.viewController?.present(vc, animated: true)
            call.resolve()
        }
    }
}

extension GameCenterPlugin: GKGameCenterControllerDelegate {
    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
