import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Image,
  Dimensions,
  ScrollView,
  NativeModules,
  Platform,
} from 'react-native';

type SetImage = {
  type: 'setImage';
  image: string;
};

type ChangeOpacity = {
  type: 'changeOpacity';
  value: number;
};
type SetHidden = {
  type: 'setHidden';
  value: boolean;
};
type SetScroll = {
  type: 'setScroll';
  value: boolean;
};
type ChangeTopOffset = {
  type: 'changeTopOffset';
  value: number;
};
type Reset = {
  type: 'reset';
  value: boolean;
};

type ServerMessages =
  | SetImage
  | ChangeOpacity
  | SetHidden
  | SetScroll
  | ChangeTopOffset
  | Reset;

export const validateMessage = (data: any) => {
  try {
    const parsed = JSON.parse(String(data));
    if ('type' in parsed && typeof parsed.type === 'string')
      return parsed as ServerMessages;
    return null;
  } catch {
    return null;
  }
};

// In a dev build, Metro serves the JS bundle from the dev machine, so the
// bundle URL carries its LAN IP (e.g. http://192.168.1.42:8081/index.bundle).
// This lets a physical device reach the CLI without configuring `host` by hand.
// Production bundles load from a file:// path, so we fall back to localhost.
const getHost = (userHost?: string) => {
  if (userHost) return userHost;
  // eslint-disable-next-line dot-notation -- bracket access required by TS index-signature rule
  const SourceCode = NativeModules['SourceCode'];
  const scriptURL: string | undefined =
    SourceCode?.getConstants?.().scriptURL ?? SourceCode?.scriptURL;
  return scriptURL?.match(/^https?:\/\/([^:/]+)/)?.[1] ?? 'localhost';
};

// A label to tell connected clients apart in the CLI's device list.
const getDeviceName = () => {
  const c = Platform.constants;
  if ('Manufacturer' in c) {
    return [c.Manufacturer, c.Model].filter(Boolean).join(' ') || 'Android';
  }
  if ('systemName' in c) return `${c.systemName} ${Platform.Version}`;
  return `${Platform.OS} ${Platform.Version}`;
};

const ImgStyle = {
  width: '100%',
} as const;

export const Overlay = ({ host, port }: { host?: string; port?: number }) => {
  const [img, setImg] = useState<{ src: string; height: number } | null>(null);
  const [opacity, setOpacity] = useState<number>(0.6);
  const [hidden, setHidden] = useState<boolean>(false);
  const [scroll, setScroll] = useState<boolean>(false);
  const [topOffset, setTopOffset] = useState<number>(0);
  const scrollRef = useRef<ScrollView>(null);
  const onSetImage = useCallback((msg: SetImage) => {
    // Use the callback form of getSize, not the promise form: the latter only
    // exists in react-native >= 0.75 (callback-only below that).
    Image.getSize(msg.image, (width, height) => {
      const screenWidth = Dimensions.get('screen').width;
      setImg({ src: msg.image, height: height / (width / screenWidth) });
    });
  }, []);

  useEffect(() => {
    const ws = new WebSocket(`ws://${getHost(host)}:${port ?? 3210}`);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'register',
          name: getDeviceName(),
        }),
      );
    };
    ws.onmessage = (e) => {
      const msg = validateMessage(e.data);
      switch (msg?.type) {
        case 'setImage': {
          return onSetImage(msg);
        }
        case 'changeOpacity':
          return setOpacity((value) =>
            Math.min(Math.max(value + msg.value, 0), 1),
          );
        case 'setHidden':
          return setHidden(msg.value);
        case 'setScroll':
          return setScroll(msg.value);
        case 'changeTopOffset':
          return setTopOffset((value) => value + msg.value);
        case 'reset':
          return setTopOffset(0);
        case undefined: {
          throw new Error('Not implemented yet: undefined case');
        }
      }
    };
    ws.onerror = (e) => console.error('Overlay', e);

    ws.onclose = () => {
      setImg(null);
    };
    return () => {
      ws.close();
    };
  }, [port, host, onSetImage]);
  const style = useMemo(
    () =>
      ({
        position: 'absolute',
        top: topOffset,
        width: '100%',
        height: '100%',
        opacity,
        pointerEvents: scroll ? undefined : 'none',
      }) as const,
    [opacity, scroll, topOffset],
  );

  if (!img || hidden) return null;
  return (
    <ScrollView ref={scrollRef} style={style}>
      <Image
        style={[ImgStyle, { height: img.height }]}
        source={{ uri: img.src }}
      />
    </ScrollView>
  );
};
