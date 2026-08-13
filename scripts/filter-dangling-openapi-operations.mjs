function missingSchemaReferences(operation, schemas) {
  const missing = new Set();
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (
      '$ref' in value &&
      typeof value.$ref === 'string' &&
      value.$ref.startsWith('#/components/schemas/')
    ) {
      const schemaName = value.$ref.slice('#/components/schemas/'.length);
      if (!schemaName || !(schemaName in schemas)) missing.add(value.$ref);
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(operation);
  return [...missing];
}

/** Keeps the immutable pin intact while preventing Orval from inventing missing DTOs. */
export default function filterDanglingOpenApiOperations(document) {
  const schemas = document.components?.schemas ?? {};
  const paths = Object.fromEntries(
    Object.entries(document.paths ?? {}).map(([path, item]) => [path, { ...item }]),
  );
  for (const [path, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (
        !operation ||
        typeof operation !== 'object' ||
        !['get', 'post', 'put', 'patch', 'delete'].includes(method)
      )
        continue;
      if (missingSchemaReferences(operation, schemas).length) delete pathItem[method];
    }
    if (
      !Object.keys(pathItem).some((key) => ['get', 'post', 'put', 'patch', 'delete'].includes(key))
    )
      delete paths[path];
  }
  return { ...document, paths };
}
