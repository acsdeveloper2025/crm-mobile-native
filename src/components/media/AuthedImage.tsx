import React, { useEffect, useState } from 'react';
import { Image, ImageProps, ImageURISource } from 'react-native';
import SessionStore from '../../services/SessionStore';
import { resolveAssetUrl } from '../../utils/resolveAssetUrl';

type Props = Omit<ImageProps, 'source'> & {
  // Relative (/uploads/...) or absolute URL. file:// is passed through.
  uri: string | null | undefined;
};

// Drop-in replacement for <Image source={{ uri }}> that attaches the
// current access token as Authorization: Bearer header for the
// underlying network request. Needed after audit T0-2 closure
// (2026-05-17) which gates /uploads/ behind requireAssetAuth.
//
// For file:// URIs the header is omitted (local read, no network).
// If the access token isn't loaded yet, render nothing to avoid a
// flash of broken-image — the token lookup is async via Keychain.
export const AuthedImage: React.FC<Props> = ({ uri, ...imageProps }) => {
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoaded, setTokenLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    SessionStore.getAccessToken()
      .then(t => {
        if (!cancelled) {
          setToken(t);
          setTokenLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setTokenLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!uri) return null;

  const resolved = resolveAssetUrl(uri);
  if (!resolved) return null;

  // file:// URIs (post-capture local preview) never hit the network
  if (resolved.startsWith('file://')) {
    return <Image {...imageProps} source={{ uri: resolved }} />;
  }

  // Wait for token before rendering network <Image> so we don't fire
  // an un-authenticated request that we'll immediately retry
  if (!tokenLoaded) return null;

  const source: ImageURISource = token
    ? { uri: resolved, headers: { Authorization: `Bearer ${token}` } }
    : { uri: resolved };

  return <Image {...imageProps} source={source} />;
};
