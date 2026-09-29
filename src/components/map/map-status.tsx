/**
 * Visible map errors shared by every map. `fallback` tells the visitor where
 * the same information is still available without the map.
 */
export function MapStatusMessages({
  mapKey,
  keyError,
  tileError,
  fallback,
}: {
  mapKey: string | null;
  keyError: string | null;
  tileError: boolean;
  fallback: string;
}) {
  return (
    <>
      {!mapKey && (
        <p role="alert" className="map-error">
          Map unavailable: <code>MAPTILER_KEY</code> is not set in <code>.env.local</code>.{" "}
          {fallback}
        </p>
      )}
      {keyError && (
        <p role="alert" className="map-error">
          Map unavailable: {keyError} Check <code>MAPTILER_KEY</code> in <code>.env.local</code>{" "}
          and that the key allows this site&apos;s address. {fallback}
        </p>
      )}
      {tileError && !keyError && (
        <p role="alert" className="map-error">
          Some map tiles failed to load. Check that the MapTiler key is valid and allows this
          site&apos;s address.
        </p>
      )}
    </>
  );
}
