import * as settings from '../util/settings';
import logger from '../util/logger';
import Extension from './extension';
import stringify from 'json-stable-stringify-without-jsonify';
import fs from 'fs';
import os from 'os';

const wotDiscoveryTopicPrefix = 'wot/td';

interface DeviceInfo {
    friendlyName: string,
    definition: zhc.Definition,
}

/**
 * This extensions handles integration with the Web of Things
 */
export default class WebOfThings extends Extension {
    devices = new Map<string, DeviceInfo>();

    constructor(zigbee: Zigbee, mqtt: MQTT, state: State, publishEntityState: PublishEntityState,
        eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
        restartCallback: () => void, addExtension: (extension: Extension) => Promise<void>) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);
    }

    override start(): Promise<void> {
        this.eventBus.onDeviceRemoved(this,
            (data: eventdata.DeviceRemoved) => this.onDeviceRemoved(data),
        );
        this.eventBus.onPublishEntityState(this,
            (data) => this.onPublishEntityState(data.entity as Device),
        );
        this.eventBus.onEntityRenamed(this,
            (device) => this.onDeviceRenamed(device),
        );

        return;
    }

    onDeviceRemoved(data: eventdata.DeviceRemoved): void {
        logger.debug(
            `Clearing Web of Things discovery topic for '${data.name}'`,
        );
        const ieeeAddr = data.ieeeAddr;
        const friendlyName = this.devices.get(ieeeAddr).friendlyName;
        this.devices.delete(ieeeAddr);
        this.removeDevice(friendlyName);
    }

    getLocalAddress(family: string): string {
        const interfaces = os.networkInterfaces();
        let address;
        Object.keys(interfaces).forEach((ifname) => {
            interfaces[ifname].forEach((iface) => {
                if (family !== iface.family || iface.internal !== false) {
                    return;
                }
                address = iface.address;
                return;
            });
        });

        return address;
    }

    getBrokerAddress(): string {
        const configAddress = settings.get().mqtt.server.split('://')[1];

        // There might be a more elegant way to do this
        if (configAddress == 'localhost' || configAddress == '127.0.0.1') {
            return this.getLocalAddress('IPv4');
        } else if (configAddress == '::1') {
            return `[${this.getLocalAddress('IPv6')}]`;
        }

        return configAddress;
    }

    async publishThingDescription(ieeeAddr: string): Promise<boolean> {
        const deviceInfo = this.devices.get(ieeeAddr);
        const model = deviceInfo.definition.model;
        try {
            let payload = fs.readFileSync(
                `lib/extension/thingModels/${model}.tm.json`,
                'utf8',
            );
            const mqttSettings = settings.get().mqtt;
            const brokerUrlScheme = mqttSettings.server.split('://')[0];
            const brokerAddress = this.getBrokerAddress();
            const baseTopic = mqttSettings.base_topic;
            const friendlyName = deviceInfo.friendlyName;

            payload = payload.replace(
                /{{MQTT_BROKER_SCHEME}}/g,
                brokerUrlScheme,
            );
            payload = payload.replace(
                /{{MQTT_BROKER_ADDRESS}}/g,
                brokerAddress,
            );
            payload = payload.replace(/{{BASE_TOPIC}}/g, baseTopic);
            payload = payload.replace(/{{FRIENDLY_NAME}}/g, friendlyName);
            payload = payload.replace(/{{IEEE_ADDRESS}}/g, ieeeAddr);
            const parsedPayload = JSON.parse(payload);
            if (mqttSettings.user && mqttSettings.password) {
                parsedPayload.securityDefinitions = {
                    basic_sc: {
                        scheme: 'basic',
                    },
                };
                parsedPayload.security = ['basic_sc'];
            }

            await this.mqtt.publish(
                friendlyName,
                stringify(parsedPayload),
                {retain: true, qos: 0},
                wotDiscoveryTopicPrefix,
            );
        } catch (error) {
            logger.error(`No Thing Model found for model ${model} (${error})`);
            return;
        }

        return true;
    }

    onPublishEntityState(entity: Device): void {
        if (entity.definition) {
            const deviceInfo: DeviceInfo = {
                friendlyName: entity.options.friendly_name,
                definition: entity.definition,
            };
            this.devices.set(entity.ieeeAddr, deviceInfo);
            this.publishThingDescription(entity.ieeeAddr);
        }
    }

    removeDevice(friendlyName: string): void {
        this.mqtt.publish(
            friendlyName,
            null,
            {retain: true, qos: 0},
            wotDiscoveryTopicPrefix,
            false,
            false,
        );
    }

    onDeviceRenamed(data: eventdata.EntityRenamed): void {
        const device = data.entity as Device;
        const ieeeAddr = device.ieeeAddr;
        const deviceInfo = this.devices.get(ieeeAddr);
        deviceInfo.friendlyName = data.to;

        logger.debug(
            `Refreshing Web of Things discovery topic for '${ieeeAddr}'`,
        );

        this.removeDevice(data.from);
        this.publishThingDescription(ieeeAddr);
    }

    // getDiscoveryTopic(config, device: Device): string {
    //     return `${config.type}/${device.ieeeAddr}/${config.object_id}/config`;
    // }
}
