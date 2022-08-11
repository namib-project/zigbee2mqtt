const settings = require("../util/settings");
const logger = require("../util/logger");
const utils = require("../util/utils");
const zigbee2mqttVersion = require("../../package.json").version;
const Extension = require("./extension");
const stringify = require("json-stable-stringify-without-jsonify");
const zigbeeHerdsmanConverters = require("zigbee-herdsman-converters");
const assert = require("assert");
const fs = require("fs");
const os = require("os");

const wotDiscoveryTopicPrefix = "wot/td";

/**
 * This extensions handles integration with the Web of Things
 */
class WebOfThings {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, settings, logger) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishEntityState = publishEntityState;
        this.eventBus = eventBus;
        this.settings = settings;
        this.logger = logger;

        this.devices = {};
    }

    start () {
        this.eventBus.onDeviceRemoved(this,
            (data) => this.onDeviceRemoved(data.resolvedEntity),
        );
        this.eventBus.onPublishEntityState(
            (data) => this.onPublishEntityState(data.entity),
        );
        this.eventBus.onDeviceRenamed(
            (device) => this.onDeviceRenamed(device),
        );
    }

    onDeviceRemoved(resolvedEntity) {
        logger.debug(
            `Clearing Web of Things discovery topic for '${resolvedEntity.name}'`
        );
        let ieeeAddr = resolvedEntity.device.ieeeAddr;
        let friendlyName = this.devices[ieeeAddr].friendlyName;
        delete this.devices[ieeeAddr];
        this.removeDevice(friendlyName);
    }

    getLocalAddress(family) {
        let interfaces = os.networkInterfaces();
        let address;
        Object.keys(interfaces).forEach(function (ifname) {
            interfaces[ifname].forEach(function (iface) {
                if (family !== iface.family || iface.internal !== false) {
                    return;
                }
                address = iface.address;
                return;
            });
        });

        return address;
    }

    getBrokerAddress() {
        let configAddress = settings.get().mqtt.server.split("://")[1];

        // There might be a more elegant way to do this
        if (configAddress == "localhost" || configAddress == "127.0.0.1") {
            return this.getLocalAddress("IPv4");
        } else if (configAddress == "::1") {
            return `[${this.getLocalAddress("IPv6")}]`;
        }

        return configAddress;
    }

    async publishThingDescription(ieeeAddr) {
        let deviceInfo = this.devices[ieeeAddr];
        let model = deviceInfo.definition.model;
        try {
            let payload = fs.readFileSync(
                `lib/extension/thingModels/${model}.tm.json`,
                "utf8"
            );
            const mqttSettings = settings.get().mqtt;
            let brokerUrlScheme = mqttSettings.server.split("://")[0];
            let brokerAddress = this.getBrokerAddress();
            let baseTopic = mqttSettings.base_topic;
            let friendlyName = deviceInfo.friendlyName;

            payload = payload.replace(
                /{{MQTT_BROKER_SCHEME}}/g,
                brokerUrlScheme
            );
            payload = payload.replace(
                /{{MQTT_BROKER_ADDRESS}}/g,
                brokerAddress
            );
            payload = payload.replace(/{{BASE_TOPIC}}/g, baseTopic);
            payload = payload.replace(/{{FRIENDLY_NAME}}/g, friendlyName);
            payload = payload.replace(/{{IEEE_ADDRESS}}/g, ieeeAddr);
            payload = JSON.parse(payload);
            if (mqttSettings.user && mqttSettings.password) {
                payload.securityDefinitions = {
                    basic_sc: {
                        scheme: "basic",
                    },
                };
                payload.security = ["basic_sc"];
            }

            await this.mqtt.publish(
                friendlyName,
                stringify(payload),
                { retain: true, qos: 0 },
                wotDiscoveryTopicPrefix
            );
        } catch (error) {
            logger.error(`No Thing Model found for model ${model} (${error})`);
            return;
        }

        return true;
    }

    async onPublishEntityState(entity) {
        if (entity.definition) {
            let deviceInfo = {
                friendlyName: entity.settings.friendlyName,
                definition: entity.definition,
            };
            this.devices[entity.device.ieeeAddr] = deviceInfo;
            this.publishThingDescription(entity.device.ieeeAddr);
        }
    }

    async removeDevice(friendlyName) {
        this.mqtt.publish(
            friendlyName,
            null,
            { retain: true, qos: 0 },
            wotDiscoveryTopicPrefix,
            false,
            false
        );
    }

    onDeviceRenamed(data) {
        let ieeeAddr = data.device.ieeeAddr;
        let deviceInfo = this.devices[ieeeAddr];
        deviceInfo.friendlyName = data.to;

        logger.debug(
            `Refreshing Web of Things discovery topic for '${ieeeAddr}'`
        );

        this.removeDevice(data.from);
        this.publishThingDescription(ieeeAddr);
    }

    getDiscoveryTopic(config, device) {
        return `${config.type}/${device.ieeeAddr}/${config.object_id}/config`;
    }
}

module.exports = WebOfThings;
