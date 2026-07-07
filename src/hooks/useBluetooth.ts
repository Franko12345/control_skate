import { useState, useEffect, useCallback, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import RNBluetoothClassic, {
  BluetoothDevice,
  BluetoothEventSubscription,
} from 'react-native-bluetooth-classic';

export function useBluetooth() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);

  // Skateboard Telemetry
  const [batteryVoltage, setBatteryVoltage] = useState<number>(0);
  const [actualRpm, setActualRpm] = useState<number>(0);
  const [isOvercurrent, setIsOvercurrent] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // References for managing subscription and reading buffers
  const dataSubscriptionRef = useRef<BluetoothEventSubscription | null>(null);
  const readBufferRef = useRef<string>('');

  // Request Android Bluetooth permissions
  const requestBluetoothPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    try {
      const apiLevel = parseInt(Platform.Version.toString(), 10);

      if (apiLevel >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        return (
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Permissão de Localização',
            message: 'O aplicativo precisa de permissão de localização para buscar dispositivos Bluetooth.',
            buttonNeutral: 'Perguntar Depois',
            buttonNegative: 'Cancelar',
            buttonPositive: 'OK',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.warn('Erro ao solicitar permissões de Bluetooth:', err);
      return false;
    }
  };

  // Check if Bluetooth is available and enabled
  const checkBluetoothState = useCallback(async () => {
    try {
      const available = await RNBluetoothClassic.isBluetoothAvailable();
      setIsAvailable(available);
      if (available) {
        const enabled = await RNBluetoothClassic.isBluetoothEnabled();
        setIsEnabled(enabled);
      }
    } catch (err) {
      console.error('Erro ao checar estado do Bluetooth:', err);
    }
  }, []);

  // Request user to enable Bluetooth
  const requestEnable = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        const enabled = await RNBluetoothClassic.requestBluetoothEnabled();
        setIsEnabled(enabled);
        return enabled;
      }
      return false;
    } catch (err) {
      console.error('Erro ao solicitar ativação do Bluetooth:', err);
      setErrorMsg('Não foi possível ativar o Bluetooth.');
      return false;
    }
  };

  // Get paired (bonded) devices
  const getPairedDevices = useCallback(async () => {
    const hasPermission = await requestBluetoothPermissions();
    if (!hasPermission) {
      setErrorMsg('Permissões de Bluetooth negadas.');
      return [];
    }

    try {
      const paired = await RNBluetoothClassic.getBondedDevices();
      setDevices(paired);
      return paired;
    } catch (err) {
      console.error('Erro ao carregar dispositivos pareados:', err);
      setErrorMsg('Erro ao buscar dispositivos pareados.');
      return [];
    }
  }, []);

  // Scan for unpaired devices (discovery)
  const startScan = async () => {
    const hasPermission = await requestBluetoothPermissions();
    if (!hasPermission) {
      setErrorMsg('Permissões de Bluetooth negadas para busca.');
      return;
    }

    const enabled = await RNBluetoothClassic.isBluetoothEnabled();
    if (!enabled) {
      const ok = await requestEnable();
      if (!ok) return;
    }

    try {
      setIsScanning(true);
      setDiscoveredDevices([]);
      setErrorMsg(null);

      // Load paired devices too
      await getPairedDevices();

      // Start discovery
      const unpaired = await RNBluetoothClassic.startDiscovery();
      setDiscoveredDevices(unpaired);
    } catch (err) {
      console.error('Erro durante a busca de dispositivos:', err);
      setErrorMsg('Falha ao buscar novos dispositivos.');
    } finally {
      setIsScanning(false);
    }
  };

  // Stop scanning
  const cancelScan = async () => {
    try {
      await RNBluetoothClassic.cancelDiscovery();
    } catch (err) {
      console.error('Erro ao cancelar busca:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const parseTelemetryPacket = (line: string) => {
    const cleanLine = line.trim();
    console.log(`[BT] Tentando parse na linha limpa: "${cleanLine}"`);
    if (!cleanLine) return;

    // 0. Overcurrent alert
    if (cleanLine.toLowerCase() === 'overcurrent') {
      console.log('[BT] SOBRECORRENTE DETECTADA! Zerando RPM.');
      setActualRpm(0);
      setIsOvercurrent(true);
      return;
    }

    // 1. Key-Value format (e.g. BAT:78,RPM:1250 or B:80,R:1400)
    const keyValMatch = cleanLine.match(
      /(?:B|BAT|BATTERY)[:=]\s*(\d+(?:\.\d+)?)\s*,\s*(?:R|RPM|REAL)[:=]\s*(\d+)/i
    );
    if (keyValMatch) {
      console.log(`[BT] Match Key-Value: BAT=${keyValMatch[1]}, RPM=${keyValMatch[2]}`);
      const bat = parseFloat(keyValMatch[1]);
      const rpm = parseInt(keyValMatch[2], 10);
      setBatteryVoltage(bat);
      setActualRpm(rpm);
      // Se voltou a receber telemetria normal, a sobrecorrente passou
      setIsOvercurrent(false);
      return;
    }

    // 2. Simple comma-separated values (e.g., "78,1250" representing battery,rpm)
    const csvMatch = cleanLine.match(/^(\d+(?:\.\d+)?)\s*,\s*(\d+)$/);
    if (csvMatch) {
      console.log(`[BT] Match CSV: BAT=${csvMatch[1]}, RPM=${csvMatch[2]}`);
      const bat = parseFloat(csvMatch[1]);
      const rpm = parseInt(csvMatch[2], 10);
      setBatteryVoltage(bat);
      setActualRpm(rpm);
      setIsOvercurrent(false);
      return;
    }

    // 3. JSON format (e.g., {"battery":78,"rpm":1250})
    try {
      const json = JSON.parse(cleanLine);
      const bat = json.battery !== undefined ? json.battery : json.b;
      const rpm = json.rpm !== undefined ? json.rpm : json.r;
      if (bat !== undefined && rpm !== undefined) {
        console.log(`[BT] Match JSON: BAT=${bat}, RPM=${rpm}`);
        setBatteryVoltage(parseFloat(bat));
        setActualRpm(parseInt(rpm, 10));
        setIsOvercurrent(false);
        return;
      }
    } catch (e) {
      // Not a valid JSON, ignore
    }

    console.log(`[BT] Aviso: Nenhum formato válido encontrado para a linha: "${cleanLine}"`);
  };

  // Handle stream data buffering and parsing
  const handleIncomingData = (data: string) => {
    console.log(`[BT] handleIncomingData chamado com: RAW='${data}'`);
    readBufferRef.current += data;
    console.log(`[BT] Buffer atualizado: '${readBufferRef.current}'`);

    const lines = readBufferRef.current.split("\r");

    // The last element is either empty (if data ended with \n) or an incomplete line

      readBufferRef.current = lines.pop() ?? '';
      let entry = lines.pop();
    while (entry) {
        console.log(`[BT] Linha extraída do buffer: "${entry}"`);
        parseTelemetryPacket(entry);
        entry = lines.pop() || '';
    }

  };

  // Connect to Bluetooth device
  const connectDevice = async (device: BluetoothDevice) => {
    setIsConnecting(true);
    setErrorMsg(null);
    try {
      // Disconnect if already connected to something else
      if (connectedDevice) {
        await disconnectDevice();
      }

      console.log(`Tentando conectar a ${device.name} [${device.address}]`);
      const connected = await device.connect({
        connectorType: 'rfcomm',
        DELIMITER: '\n',
      });

      if (connected) {
        setConnectedDevice(device);

        // Setup data listener
        if (dataSubscriptionRef.current) {
          dataSubscriptionRef.current.remove();
        }

        readBufferRef.current = '';
        dataSubscriptionRef.current = device.onDataReceived((event) => {
          console.log('[BT] Evento onDataReceived disparado:', event);
          if (event && event.data) {
            handleIncomingData(event.data);
          } else {
            console.log('[BT] Evento recebido, mas campo data está vazio/nulo.');
          }
        });

        console.log('Conectado com sucesso!');
      } else {
        setErrorMsg('Não foi possível estabelecer conexão.');
      }
    } catch (err) {
      console.error('Erro ao conectar ao dispositivo:', err);
      setErrorMsg('Falha na conexão. Verifique se o HC-05 está ligado.');
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect device
  const disconnectDevice = async () => {
    if (dataSubscriptionRef.current) {
      dataSubscriptionRef.current.remove();
      dataSubscriptionRef.current = null;
    }

    if (connectedDevice) {
      try {
        await connectedDevice.disconnect();
      } catch (err) {
        console.error('Erro ao desconectar:', err);
      }
    }
    setConnectedDevice(null);
  };

  // Write target RPM command to connected device
  const sendRpm = async (rpm: number) => {
    if (!connectedDevice) return false;

      console.log(`Sent: ${rpm}`);

    try {
      const command = `${rpm}\n`;
      const success = await connectedDevice.write(command);
      return success;
    } catch (err) {
      console.error('Erro ao enviar comando RPM:', err);
      return false;
    }

  };

  // Check state on mount
  useEffect(() => {
    checkBluetoothState();

    // Refresh bonded devices list initially if enabled
    RNBluetoothClassic.isBluetoothEnabled().then((enabled) => {
      if (enabled) {
        getPairedDevices();
      }
    });

    // Handle state change listeners
    const stateSub = RNBluetoothClassic.onStateChanged((event) => {
      setIsEnabled(event.enabled);
      if (event.enabled) {
        getPairedDevices();
      } else {
        setDevices([]);
        setConnectedDevice(null);
      }
    });

    return () => {
      stateSub.remove();
      if (dataSubscriptionRef.current) {
        dataSubscriptionRef.current.remove();
      }
    };
  }, [checkBluetoothState, getPairedDevices]);

  // Handle active device disconnect events
  useEffect(() => {
    if (!connectedDevice) return;

    const disconnectSub = RNBluetoothClassic.onDeviceDisconnected(() => {
      console.log('O dispositivo se desconectou.');
      setConnectedDevice(null);
      if (dataSubscriptionRef.current) {
        dataSubscriptionRef.current.remove();
        dataSubscriptionRef.current = null;
      }
      setErrorMsg('Dispositivo desconectado.');
    });

    return () => {
      disconnectSub.remove();
    };
  }, [connectedDevice]);

  return {
    isAvailable,
    isEnabled,
    isScanning,
    isConnecting,
    devices,
    discoveredDevices,
    connectedDevice,
    batteryVoltage,
    actualRpm,
    isOvercurrent,
    errorMsg,
    requestEnable,
    startScan,
    cancelScan,
    getPairedDevices,
    connectDevice,
    disconnectDevice,
    sendRpm,
    setErrorMsg,
  };
}
