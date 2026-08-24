import { fetchLookerPayload, handleLookerRequest } from '../../src/lib/lookerApi'

export default async (req: Request) => handleLookerRequest(req)

export { fetchLookerPayload }
