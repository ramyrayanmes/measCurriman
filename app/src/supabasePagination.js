export async function fetchAll(makeQuery) {
  const rows = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await makeQuery().range(start, start + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}
