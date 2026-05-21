import Foundation

enum QuareAPIError: Error {
    case invalidURL
    case badResponse(Int)
    case missingPin
}

enum QuareAPI {
    private static var baseURL: String {
        ProcessInfo.processInfo.environment["QUARE_API_URL"]
            ?? Bundle.main.object(forInfoDictionaryKey: "QuareAPIURL") as? String
            ?? ""
    }

    static func storeDocument<T: Encodable>(_ data: T) async throws -> String {
        guard let url = URL(string: "\(baseURL)/documents") else { throw QuareAPIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(data)
        let (responseData, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 201 else { throw QuareAPIError.badResponse(status) }
        let result = try JSONDecoder().decode([String: String].self, from: responseData)
        guard let pin = result["pin"] else { throw QuareAPIError.missingPin }
        return pin
    }

    static func retrieveDocument(pin: String) async throws -> Data {
        guard let url = URL(string: "\(baseURL)/documents/\(pin)") else { throw QuareAPIError.invalidURL }
        let (data, response) = try await URLSession.shared.data(from: url)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw QuareAPIError.badResponse(status) }
        return data
    }
}
