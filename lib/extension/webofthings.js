const settings = require("../util/settings");
const logger = require("../util/logger");
const utils = require("../util/utils");
const zigbee2mqttVersion = require("../../package.json").version;
const Extension = require("./extension");
const stringify = require("json-stable-stringify-without-jsonify");
const zigbeeHerdsmanConverters = require("zigbee-herdsman-converters");
const assert = require("assert");
const fs = require("fs");

const wotDiscoveryTopicPrefix = "wot/td";

/**
 * This extensions handles integration with the Web of Things
 */
class WebOfThings extends Extension {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus) {
        super(zigbee, mqtt, state, publishEntityState, eventBus);

        this.eventBus.on(
            "deviceRemoved",
            (data) => this.onDeviceRemoved(data.resolvedEntity),
            this.constructor.name
        );
        this.eventBus.on(
            "publishEntityState",
            (data) => this.onPublishEntityState(data),
            this.constructor.name
        );
        this.eventBus.on(
            "deviceRenamed",
            (data) => this.onDeviceRenamed(data),
            this.constructor.name
        );
    }

    onDeviceRemoved(resolvedEntity) {
        logger.debug(
            `Clearing Web of Things discovery topic for '${resolvedEntity.name}'`
        );
        this.removeDevice(data);
    }

    async publishThingDescription(data) {
        let model = data.entity.definition.model;
        try {
            let payload = fs.readFileSync(
                `lib/extension/thingModels/${model}.tm.json`,
                "utf8"
            );
            // FIXME: Get "external" IP address if hostname is "localhost"
            let mqttServer = settings.get().mqtt.server.split("://")[1];
            let baseTopic = settings.get().mqtt.base_topic;
            let friendlyName = data.entity.settings.friendlyName;
            let ieee_address = data.entity.device.ieeeAddr;

            payload = payload.replace(/{{MQTT_BROKER_ADDRESS}}/g, mqttServer);
            payload = payload.replace(/{{BASE_TOPIC}}/g, baseTopic);
            payload = payload.replace(/{{FRIENDLY_NAME}}/g, friendlyName);
            payload = payload.replace(/{{IEEE_ADDRESS}}/g, ieee_address);
            payload = JSON.parse(payload);

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
    }

    async onPublishEntityState(data) {
        if (data.entity.definition) {
            this.publishThingDescription(data);
        }
    }

    async removeDevice(data) {
        this.mqtt.publish(
            data.from,
            null,
            { retain: true, qos: 0 },
            wotDiscoveryTopicPrefix,
            false,
            false
        );
    }

    onDeviceRenamed(data) {
        logger.debug(
            `Refreshing Web of Things discovery topic for '${data.device.ieeeAddr}'`
        );

        this.removeDevice(data);

        publishThingDescription(data);
    }

    getDiscoveryTopic(config, device) {
        return `${config.type}/${device.ieeeAddr}/${config.object_id}/config`;
    }
}

module.exports = WebOfThings;
